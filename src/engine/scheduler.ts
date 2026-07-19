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

// Exact 0/1 knapsack via dynamic programming — see docs/scheduling.md's
// "Greedy vs. exact DP" section. Same in/out shape as generatePlan() so the
// two are directly comparable; not used in production, only for measuring
// how close the greedy heuristic gets to optimal (see scripts/compareSchedulers.ts).
//
// Hours are discretised to HOUR_GRANULARITY so the DP table can be indexed by
// integer capacity units — a real trade-off of exact DP noted in the design doc.
// Coarser values (tried: 0.5h) can make "exact" score *below* greedy on some
// real inputs: rounding weights up so the table never overcounts capacity
// means a game can look too big to fit when the true continuous hours would
// have. 0.05h (3 minutes) empirically eliminated that on the real library
// (see scripts/compareSchedulers.ts) while the table stays trivially small.
const HOUR_GRANULARITY = 0.05;

export function generatePlanExact(games: SchedulableGame[], hoursAvailable: number, now: Date = new Date()): SchedulePlan {
  const scored = games.map((game) => ({ game, ...scoreGame(game, now) }));
  // Round weight UP (never down) so a game never discretises to look cheaper
  // than it truly is — that's what previously let hoursUsed overshoot the
  // budget when a rounded-down weight fit the table but the real hours didn't.
  const weights = scored.map((s) => Math.ceil(s.remainingHours / HOUR_GRANULARITY));
  const capacityUnits = Math.max(Math.floor(hoursAvailable / HOUR_GRANULARITY), 0);

  const n = scored.length;
  // dp[i][c] = best total score achievable using the first i games with capacity c (in units)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacityUnits + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const weight = weights[i - 1] as number;
    const value = scored[i - 1]!.score;
    for (let c = 0; c <= capacityUnits; c++) {
      dp[i]![c] = dp[i - 1]![c] as number;
      if (weight <= c) {
        const candidate = (dp[i - 1]![c - weight] as number) + value;
        if (candidate > (dp[i]![c] as number)) {
          dp[i]![c] = candidate;
        }
      }
    }
  }

  const takenIndices: number[] = [];
  let c = capacityUnits;
  for (let i = n; i >= 1; i--) {
    if (dp[i]![c] !== dp[i - 1]![c]) {
      takenIndices.push(i - 1);
      c -= weights[i - 1] as number;
    }
  }

  const entries: PlanEntryResult[] = takenIndices
    .map((idx) => ({ ...scored[idx]!, allocatedHours: (weights[idx] as number) * HOUR_GRANULARITY }))
    .sort((a, b) => b.score - a.score)
    .map(({ game, score, completionBonus, recencyPenalty, allocatedHours }, position) => ({
      gameId: game.id,
      name: game.name,
      allocatedHours,
      position,
      score,
      completionBonus,
      recencyPenalty,
    }));

  const hoursUsed = entries.reduce((sum, entry) => sum + entry.allocatedHours, 0);

  return { entries, hoursAvailable, hoursUsed };
}
