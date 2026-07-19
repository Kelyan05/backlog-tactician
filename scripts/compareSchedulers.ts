// Empirical greedy-vs-exact comparison over the real library, at a few
// different weekly budgets. Not a test — a report, run on demand:
//   node scripts/compareSchedulers.ts
import { prisma } from "../src/lib/prisma.ts";
import { getOrCreateDevOwner } from "../src/lib/currentUser.ts";
import { generatePlan, generatePlanExact, type SchedulableGame } from "../src/engine/scheduler.ts";

const BUDGETS_TO_TRY = [5, 10, 20, 40];

function totalScore(entries: { score: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.score, 0);
}

async function main() {
  const owner = await getOrCreateDevOwner();
  const games = await prisma.game.findMany({ where: { userId: owner.id, timeToBeatHours: { not: null } } });

  const schedulable: SchedulableGame[] = games.map((game) => ({
    id: game.id,
    name: game.name,
    timeToBeatHours: game.timeToBeatHours as number,
    playtimeMinutes: game.playtimeMinutes,
    lastPlayedAt: game.lastPlayedAt,
  }));

  console.log(`Comparing greedy vs. exact DP over ${schedulable.length} schedulable games\n`);
  console.log("budget(h) | greedy score | exact score | gap | greedy hoursUsed | exact hoursUsed");
  console.log("----------|--------------|-------------|-----|-------------------|------------------");

  for (const hoursAvailable of BUDGETS_TO_TRY) {
    const greedy = generatePlan(schedulable, hoursAvailable);
    const exact = generatePlanExact(schedulable, hoursAvailable);

    const greedyScore = totalScore(greedy.entries);
    const exactScore = totalScore(exact.entries);
    const gapPct = exactScore > 0 ? (((exactScore - greedyScore) / exactScore) * 100).toFixed(1) : "0.0";

    console.log(
      `${String(hoursAvailable).padStart(9)} | ${greedyScore.toFixed(2).padStart(12)} | ${exactScore.toFixed(2).padStart(11)} | ${gapPct.padStart(3)}% | ${greedy.hoursUsed.toFixed(1).padStart(17)} | ${exact.hoursUsed.toFixed(1).padStart(16)}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
