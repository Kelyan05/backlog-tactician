// Pure function: games + budget in, plan out. No DB, no HTTP — see docs/scheduling.md.

const BASE_VALUE = 5;
const COMPLETION_WEIGHT = 10;
const RECENCY_WEIGHT = 3;
const RECENCY_WINDOW_DAYS = 3;
const MIN_REMAINING_HOURS = 0.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SchedulableGame {
  id: number;
  name: string;
  timeToBeatHours: number;
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
}

export interface PlanEntryResult {
  gameId: number;
  name: string;
  allocatedHours: number;
  position: number;
  score: number;
  completionBonus: number;
  recencyPenalty: number;
}

export interface SchedulePlan {
  entries: PlanEntryResult[];
  hoursAvailable: number;
  hoursUsed: number;
}

function scoreGame(game: SchedulableGame, now: Date): { score: number; completionBonus: number; recencyPenalty: number; remainingHours: number } {
  const playtimeHours = game.playtimeMinutes / 60;
  const completionRatio = Math.min(Math.max(playtimeHours / game.timeToBeatHours, 0), 1);
  const completionBonus = completionRatio * COMPLETION_WEIGHT;

  const daysSincePlayed = game.lastPlayedAt ? (now.getTime() - game.lastPlayedAt.getTime()) / MS_PER_DAY : null;
  const recencyPenalty =
    daysSincePlayed !== null && daysSincePlayed < RECENCY_WINDOW_DAYS
      ? RECENCY_WEIGHT * (1 - daysSincePlayed / RECENCY_WINDOW_DAYS)
      : 0;

  const score = BASE_VALUE + completionBonus - recencyPenalty;
  const remainingHours = Math.max(game.timeToBeatHours - playtimeHours, MIN_REMAINING_HOURS);

  return { score, completionBonus, recencyPenalty, remainingHours };
}

export function generatePlan(games: SchedulableGame[], hoursAvailable: number, now: Date = new Date()): SchedulePlan {
  const scored = games.map((game) => ({ game, ...scoreGame(game, now) }));
  scored.sort((a, b) => b.score / b.remainingHours - a.score / a.remainingHours);

  const entries: PlanEntryResult[] = [];
  let hoursUsed = 0;

  for (const { game, score, completionBonus, recencyPenalty, remainingHours } of scored) {
    if (hoursUsed + remainingHours > hoursAvailable) {
      // Skip, don't stop — a smaller game further down the sorted-by-density
      // list may still fit in whatever budget is left (see docs/scheduling.md).
      continue;
    }

    hoursUsed += remainingHours;
    entries.push({
      gameId: game.id,
      name: game.name,
      allocatedHours: remainingHours,
      position: entries.length,
      score,
      completionBonus,
      recencyPenalty,
    });
  }

  return { entries, hoursAvailable, hoursUsed };
}
