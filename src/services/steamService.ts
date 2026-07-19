import "dotenv/config";
import { prisma } from "../lib/prisma.ts";
import { EstimateSource } from "../lib/estimateSource.ts";

interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
}

interface SteamOwnedGamesResponse {
  response: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
}

async function fetchOwnedGames(): Promise<SteamOwnedGame[]> {
  const apiKey = process.env.STEAM_API_KEY;
  const steamId = process.env.STEAM_ID;

  if (!apiKey || !steamId) {
    throw new Error("STEAM_API_KEY and STEAM_ID must be set in .env");
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

// Upserts by steamAppId so re-running never clobbers timeToBeatHours/timeToBeatSource,
// which come from IGDB or a manual override, not from Steam.
export async function importOwnedGames(userId: number): Promise<{ imported: number }> {
  const games = await fetchOwnedGames();

  for (const game of games) {
    await prisma.game.upsert({
      where: { steamAppId: game.appid },
      update: {
        name: game.name,
        playtimeMinutes: game.playtime_forever,
      },
      create: {
        steamAppId: game.appid,
        name: game.name,
        playtimeMinutes: game.playtime_forever,
        timeToBeatSource: EstimateSource.NONE,
        userId,
      },
    });
  }

  return { imported: games.length };
}
