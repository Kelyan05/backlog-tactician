// Pure function: games + budget in, plan out. No DB, no HTTP — see docs/scheduling.md.

const BASE_VALUE = 5;
const COMPLETION_WEIGHT = 10;
const RECENCY_WEIGHT = 3;
const RECENCY_WINDOW_DAYS = 3;
const GENRE_VARIETY_WEIGHT = 3;
const MIN_REMAINING_HOURS = 0.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SchedulableGame {
  id: number;
  name: string;
  timeToBeatHours: number;
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
  genre?: string | null;
}

export interface PlanEntryResult {
  gameId: number;
  name: string;
  allocatedHours: number;
  position: number;
  score: number;
  completionBonus: number;
  recencyPenalty: number;
  varietyBonus: number;
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

// Genre variety is a property of the *plan as a whole* — a game's variety
// bonus depends on which genres are already in the plan, so it can't be
// folded into a single static per-game score the way completionBonus and
// recencyPenalty are. Instead of one upfront sort + linear pass, this
// repeatedly re-ranks the remaining candidates against the genres chosen
// so far and picks the single best-fitting one each round — O(n^2) instead
// of O(n log n), which is fine at real-world library sizes (see docs/scheduling.md).
export function generatePlan(games: SchedulableGame[], hoursAvailable: number, now: Date = new Date()): SchedulePlan {
  const remaining = games.map((game) => ({ game, ...scoreGame(game, now) }));

  const entries: PlanEntryResult[] = [];
  const seenGenres = new Set<string>();
  let hoursUsed = 0;

  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestDensity = -Infinity;
    let bestVarietyBonus = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      if (hoursUsed + candidate.remainingHours > hoursAvailable) {
        continue;
      }

      const isNewGenre = Boolean(candidate.game.genre) && !seenGenres.has(candidate.game.genre as string);
      const varietyBonus = isNewGenre ? GENRE_VARIETY_WEIGHT : 0;
      const density = (candidate.score + varietyBonus) / candidate.remainingHours;

      if (density > bestDensity) {
        bestDensity = density;
        bestIndex = i;
        bestVarietyBonus = varietyBonus;
      }
    }

    if (bestIndex === -1) {
      // Nothing left fits the remaining budget — smaller games would have
      // been found by this same scan, so there's nothing more to try.
      break;
    }

    const { game, score, completionBonus, recencyPenalty, remainingHours } = remaining[bestIndex]!;
    hoursUsed += remainingHours;
    if (game.genre) seenGenres.add(game.genre);

    entries.push({
      gameId: game.id,
      name: game.name,
      allocatedHours: remainingHours,
      position: entries.length,
      score: score + bestVarietyBonus,
      completionBonus,
      recencyPenalty,
      varietyBonus: bestVarietyBonus,
    });

    remaining.splice(bestIndex, 1);
  }

  return { entries, hoursAvailable, hoursUsed };
}

// Exact 0/1 knapsack via dynamic programming — see docs/scheduling.md's
// "Greedy vs. exact DP" section. Same in/out shape as generatePlan() so the
// two are directly comparable; not used in production, only for measuring
// how close the greedy heuristic gets to optimal (see scripts/compareSchedulers.ts).
//
// Deliberately does NOT model genre variety: variety bonus depends on which
// other items are already chosen, breaking the classic knapsack DP's core
// assumption that each item's value is independent of the others selected.
// Modelling it exactly would mean expanding the DP state to track which
// genres have been used so far — exponential in the number of distinct
// genres, a materially bigger problem (closer to budgeted maximum coverage
// than simple knapsack). Out of scope here; this solver answers "how close
// is greedy to optimal on the completion/recency dimensions alone."
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
      varietyBonus: 0,
    }));

  const hoursUsed = entries.reduce((sum, entry) => sum + entry.allocatedHours, 0);

  return { entries, hoursAvailable, hoursUsed };
}
