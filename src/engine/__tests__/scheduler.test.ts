import { generatePlan, generatePlanExact, type SchedulableGame } from "../scheduler.ts";

const NOW = new Date("2026-07-19T00:00:00Z");

function game(overrides: Partial<SchedulableGame> & Pick<SchedulableGame, "id" | "name">): SchedulableGame {
  return {
    timeToBeatHours: 10,
    playtimeMinutes: 0,
    lastPlayedAt: null,
    ...overrides,
  };
}

describe("generatePlan", () => {
  it("returns an empty plan for an empty backlog", () => {
    const plan = generatePlan([], 10, NOW);
    expect(plan.entries).toEqual([]);
    expect(plan.hoursUsed).toBe(0);
  });

  it("excludes a single game that alone exceeds the weekly budget", () => {
    const games = [game({ id: 1, name: "Too Big", timeToBeatHours: 20, playtimeMinutes: 0 })];
    const plan = generatePlan(games, 10, NOW);
    expect(plan.entries).toEqual([]);
    expect(plan.hoursUsed).toBe(0);
  });

  it("skips an over-budget game instead of stopping, so smaller games later in the list still get scheduled", () => {
    // BIG has the highest value density (sorts first) but its remaining hours alone blow the budget.
    // A correct greedy skips it and keeps going; a buggy "stop on first non-fit" would return an empty plan.
    const games = [
      game({ id: 1, name: "BIG", timeToBeatHours: 132, playtimeMinutes: 120 * 60 }), // remaining 12h, high completion bonus
      game({ id: 2, name: "SMALL1", timeToBeatHours: 5, playtimeMinutes: 0 }),
      game({ id: 3, name: "SMALL2", timeToBeatHours: 5, playtimeMinutes: 0 }),
    ];

    const plan = generatePlan(games, 10, NOW);

    expect(plan.entries.map((e) => e.gameId)).toEqual([2, 3]);
    expect(plan.hoursUsed).toBe(10);
  });

  it("exactly consumes the budget when games add up perfectly", () => {
    const games = [
      game({ id: 1, name: "Four Hours", timeToBeatHours: 4, playtimeMinutes: 0 }),
      game({ id: 2, name: "Six Hours", timeToBeatHours: 6, playtimeMinutes: 0 }),
    ];

    const plan = generatePlan(games, 10, NOW);

    expect(plan.entries).toHaveLength(2);
    expect(plan.hoursUsed).toBe(10);
  });

  it("prefers a near-complete game over an equally-long fresh game", () => {
    const nearComplete = game({ id: 1, name: "Nearly Done", timeToBeatHours: 10, playtimeMinutes: 9 * 60 });
    const fresh = game({ id: 2, name: "Fresh Start", timeToBeatHours: 10, playtimeMinutes: 0 });

    // Budget only fits one full 10h+ item (fresh) or the ~1h remaining on the near-complete one, not both.
    const plan = generatePlan([nearComplete, fresh], 1, NOW);

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]?.gameId).toBe(1);
  });

  it("produces the same output for the same input (deterministic, no shared mutation)", () => {
    const games = [
      game({ id: 1, name: "A", timeToBeatHours: 9, playtimeMinutes: 7.5 * 60, lastPlayedAt: new Date("2026-07-09") }),
      game({ id: 2, name: "B", timeToBeatHours: 22, playtimeMinutes: 2 * 60, lastPlayedAt: new Date("2026-07-18") }),
      game({ id: 3, name: "C", timeToBeatHours: 8.5, playtimeMinutes: 0 }),
    ];

    const first = generatePlan(games, 10, NOW);
    const second = generatePlan(games, 10, NOW);

    expect(second).toEqual(first);
  });
});

describe("generatePlanExact", () => {
  it("returns an empty plan for an empty backlog", () => {
    const plan = generatePlanExact([], 10, NOW);
    expect(plan.entries).toEqual([]);
    expect(plan.hoursUsed).toBe(0);
  });

  it("never allocates more hours than the budget, even across rounding", () => {
    const games = [
      game({ id: 1, name: "A", timeToBeatHours: 5.6, playtimeMinutes: 0.5 * 60 }),
      game({ id: 2, name: "B", timeToBeatHours: 5.6, playtimeMinutes: 0.5 * 60 }),
      game({ id: 3, name: "C", timeToBeatHours: 5.6, playtimeMinutes: 0.5 * 60 }),
    ];

    const plan = generatePlanExact(games, 10, NOW);

    expect(plan.hoursUsed).toBeLessThanOrEqual(10);
  });

  it("finds a strictly better plan than greedy on an adversarial input (greedy is not always optimal)", () => {
    // Big: remaining 10h, score 10 (density 1.0) — fits the budget alone.
    // DecoyA/B: remaining 5.1h each, score ~5.89 (density ~1.15) — sort ahead of
    // Big, but the two can't both fit, and neither combines with Big either.
    // Greedy grabs one decoy and gets stuck with budget left over; the exact
    // solver recognises Big alone beats any decoy combination.
    const games = [
      game({ id: 1, name: "Big", timeToBeatHours: 20, playtimeMinutes: 10 * 60 }),
      game({ id: 2, name: "DecoyA", timeToBeatHours: 5.6, playtimeMinutes: 0.5 * 60 }),
      game({ id: 3, name: "DecoyB", timeToBeatHours: 5.6, playtimeMinutes: 0.5 * 60 }),
    ];

    const greedy = generatePlan(games, 10, NOW);
    const exact = generatePlanExact(games, 10, NOW);

    const totalScore = (plan: { entries: { score: number }[] }) => plan.entries.reduce((sum, e) => sum + e.score, 0);

    expect(exact.entries.map((e) => e.gameId)).toEqual([1]);
    expect(totalScore(exact)).toBeGreaterThan(totalScore(greedy));
  });
});
