import "dotenv/config";
import { prisma } from "../lib/prisma.ts";
import { EstimateSource } from "../lib/estimateSource.ts";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE = "https://api.igdb.com/v4";
const STEAM_EXTERNAL_GAME_SOURCE = 1;

// IGDB rate-limits per Client-ID, so games are enriched in small batches
// (one IN-clause query per batch instead of one request per game) with a
// pause between batches, rather than firing every request at once.
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;
const RATE_LIMIT_RETRY_DELAY_MS = 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Client-credentials flow (app-only, no user involved) — cache the token
// in memory and only fetch a new one once it's within a minute of expiring.
async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set in .env");
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    throw new Error(`IGDB token request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
}

// Retries exactly once on a 429, waiting for Retry-After (seconds) if the
// API sent one, otherwise a fixed backoff. A second 429 is a real failure
// and propagates so the caller can log-and-skip instead of retrying forever.
async function igdbQuery<T>(endpoint: string, query: string, isRetry = false): Promise<T> {
  const token = await getAppToken();
  const clientId = process.env.IGDB_CLIENT_ID as string;

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: query,
  });

  if (response.status === 429 && !isRetry) {
    const retryAfter = response.headers.get("Retry-After");
    const delayMs = retryAfter ? Number(retryAfter) * 1000 : RATE_LIMIT_RETRY_DELAY_MS;
    await sleep(delayMs);
    return igdbQuery<T>(endpoint, query, true);
  }

  if (!response.ok) {
    throw new Error(`IGDB ${endpoint} request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

// One request for the whole batch instead of one per game.
async function findGameIdsBySteamAppIds(steamAppIds: number[]): Promise<Map<number, number>> {
  if (steamAppIds.length === 0) return new Map();

  const uidList = steamAppIds.map((id) => `"${id}"`).join(",");
  const results = await igdbQuery<{ uid: string; game: number }[]>(
    "external_games",
    `fields uid,game; where uid = (${uidList}) & external_game_source = ${STEAM_EXTERNAL_GAME_SOURCE}; limit ${steamAppIds.length};`,
  );

  return new Map(results.map((result) => [Number(result.uid), result.game]));
}

// Fuzzy fallback for games IGDB has no Steam-appid mapping for — inherently
// one request per game, since `search` takes a single string.
async function findGameIdByName(name: string): Promise<number | null> {
  const escaped = name.replace(/"/g, '\\"');
  const results = await igdbQuery<{ id: number }[]>("games", `search "${escaped}"; fields id; limit 1;`);
  return results[0]?.id ?? null;
}

async function getTimeToBeatHoursBatch(gameIds: number[]): Promise<Map<number, number>> {
  if (gameIds.length === 0) return new Map();

  const results = await igdbQuery<{ game_id: number; normally: number | null }[]>(
    "game_time_to_beats",
    `fields game_id,normally; where game_id = (${gameIds.join(",")}); limit ${gameIds.length};`,
  );

  const map = new Map<number, number>();
  for (const result of results) {
    if (result.normally) {
      map.set(result.game_id, Math.round((result.normally / 3600) * 10) / 10);
    }
  }
  return map;
}

interface SkippedGame {
  steamAppId: number;
  name: string;
  reason: string;
}

// Only fills genuine gaps — never overwrites an estimate that's already set,
// whether it came from a prior IGDB match or a manual override. Games that
// fail to look up (rate limit exhausted its one retry, network error, no
// IGDB match at all) are logged and skipped rather than aborting the run.
export async function enrichGamesWithTimeToBeat(
  userId: number,
): Promise<{ enriched: number; total: number; skipped: SkippedGame[] }> {
  const games = await prisma.game.findMany({ where: { userId, timeToBeatHours: null } });
  const skipped: SkippedGame[] = [];
  let enriched = 0;

  for (const batch of chunk(games, BATCH_SIZE)) {
    try {
      const gameIdBySteamAppId = await findGameIdsBySteamAppIds(batch.map((game) => game.steamAppId));

      const nameMatchedGameId = new Map<number, number>();
      for (const game of batch) {
        if (gameIdBySteamAppId.has(game.steamAppId)) continue;
        try {
          const gameId = await findGameIdByName(game.name);
          if (gameId) nameMatchedGameId.set(game.steamAppId, gameId);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`Skipping "${game.name}" (${game.steamAppId}): ${reason}`);
          skipped.push({ steamAppId: game.steamAppId, name: game.name, reason });
        }
      }

      const allGameIds = [...gameIdBySteamAppId.values(), ...nameMatchedGameId.values()];
      const hoursByGameId = await getTimeToBeatHoursBatch(allGameIds);

      for (const game of batch) {
        const igdbGameId = gameIdBySteamAppId.get(game.steamAppId) ?? nameMatchedGameId.get(game.steamAppId);
        const hours = igdbGameId !== undefined ? hoursByGameId.get(igdbGameId) : undefined;
        if (hours !== undefined) {
          await prisma.game.update({
            where: { id: game.id },
            data: { timeToBeatHours: hours, timeToBeatSource: EstimateSource.IGDB },
          });
          enriched++;
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping batch [${batch.map((game) => game.name).join(", ")}]: ${reason}`);
      skipped.push(...batch.map((game) => ({ steamAppId: game.steamAppId, name: game.name, reason })));
    }

    await sleep(BATCH_DELAY_MS);
  }

  return { enriched, total: games.length, skipped };
}
