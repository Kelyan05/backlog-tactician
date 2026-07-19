import "dotenv/config";
import { prisma } from "../lib/prisma.ts";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE = "https://api.igdb.com/v4";
const STEAM_EXTERNAL_GAME_SOURCE = 1;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

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

async function igdbQuery<T>(endpoint: string, query: string): Promise<T> {
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

  if (!response.ok) {
    throw new Error(`IGDB ${endpoint} request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function findGameIdBySteamAppId(steamAppId: number): Promise<number | null> {
  const results = await igdbQuery<{ game: number }[]>(
    "external_games",
    `fields game; where uid = "${steamAppId}" & external_game_source = ${STEAM_EXTERNAL_GAME_SOURCE};`,
  );
  return results[0]?.game ?? null;
}

async function findGameIdByName(name: string): Promise<number | null> {
  const escaped = name.replace(/"/g, '\\"');
  const results = await igdbQuery<{ id: number }[]>("games", `search "${escaped}"; fields id; limit 1;`);
  return results[0]?.id ?? null;
}

async function getTimeToBeatHours(gameId: number): Promise<number | null> {
  const results = await igdbQuery<{ normally: number | null }[]>(
    "game_time_to_beats",
    `fields normally; where game_id = ${gameId};`,
  );
  const seconds = results[0]?.normally;
  return seconds ? Math.round((seconds / 3600) * 10) / 10 : null;
}

// Steam appid match first (reliable), name search as a fallback (fuzzy, best-effort).
export async function findTimeToBeatHours(steamAppId: number, name: string): Promise<number | null> {
  const gameId = (await findGameIdBySteamAppId(steamAppId)) ?? (await findGameIdByName(name));
  if (!gameId) return null;
  return getTimeToBeatHours(gameId);
}

// Only fills genuine gaps — never overwrites an estimate that's already set,
// whether it came from a prior IGDB match or a manual override.
export async function enrichGamesWithTimeToBeat(userId: number): Promise<{ enriched: number; total: number }> {
  const games = await prisma.game.findMany({
    where: { userId, timeToBeatHours: null },
  });

  let enriched = 0;
  for (const game of games) {
    const hours = await findTimeToBeatHours(game.steamAppId, game.name);
    if (hours !== null) {
      await prisma.game.update({
        where: { id: game.id },
        data: { timeToBeatHours: hours, timeToBeatSource: "IGDB" },
      });
      enriched++;
    }
  }

  return { enriched, total: games.length };
}
