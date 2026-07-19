import "dotenv/config";
import { prisma } from "../lib/prisma.ts";
import { EstimateSource } from "../lib/estimateSource.ts";
import { HttpError } from "../lib/errors.ts";

interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  rtime_last_played?: number;
}

interface SteamOwnedGamesResponse {
  response: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
}

// STEAM_API_KEY is the app's own registered key (one per deployment, not
// per user) — a real server-side secret. steamId identifies *whose*
// library to fetch, and comes from that user's own Steam login, not env.
async function fetchOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    throw new Error("STEAM_API_KEY must be set in .env");
  }

  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam API request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SteamOwnedGamesResponse;
  return data.response.games ?? [];
}

// Upserts by (userId, steamAppId) so re-running never clobbers
// timeToBeatHours/timeToBeatSource, which come from IGDB or a manual
// override, not from Steam.
export async function importOwnedGames(userId: number): Promise<{ imported: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.steamId) {
    throw new HttpError(400, "Connect your Steam account before importing your library");
  }

  const games = await fetchOwnedGames(user.steamId);

  for (const game of games) {
    const lastPlayedAt = game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null;

    await prisma.game.upsert({
      where: { userId_steamAppId: { userId, steamAppId: game.appid } },
      update: {
        name: game.name,
        playtimeMinutes: game.playtime_forever,
        lastPlayedAt,
      },
      create: {
        steamAppId: game.appid,
        name: game.name,
        playtimeMinutes: game.playtime_forever,
        lastPlayedAt,
        timeToBeatSource: EstimateSource.NONE,
        userId,
      },
    });
  }

  return { imported: games.length };
}
