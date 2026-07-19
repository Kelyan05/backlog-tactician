import { prisma } from "../lib/prisma.ts";
import { generatePlan, type SchedulableGame } from "../engine/scheduler.ts";

const PLAN_INCLUDE = {
  entries: { include: { game: true }, orderBy: { position: "asc" as const } },
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = (day + 6) % 7; // days since the most recent Monday
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Runs the pure engine over the caller's schedulable library (games with a
// real time-to-beat estimate — see docs/scheduling.md), then persists the
// Plan and its PlanEntries atomically: either both are written, or neither is.
export async function createPlan(userId: number, hoursAvailable: number) {
  const games = await prisma.game.findMany({
    where: { userId, timeToBeatHours: { not: null } },
  });

  const schedulable: SchedulableGame[] = games.map((game) => ({
    id: game.id,
    name: game.name,
    timeToBeatHours: game.timeToBeatHours as number,
    playtimeMinutes: game.playtimeMinutes,
    lastPlayedAt: game.lastPlayedAt,
  }));

  const result = generatePlan(schedulable, hoursAvailable);

  return prisma.$transaction(async (tx) => {
    const created = await tx.plan.create({
      data: { userId, weekStart: startOfWeek(new Date()) },
    });

    if (result.entries.length > 0) {
      await tx.planEntry.createMany({
        data: result.entries.map((entry) => ({
          planId: created.id,
          gameId: entry.gameId,
          allocatedHours: entry.allocatedHours,
          position: entry.position,
          score: entry.score,
          completionBonus: entry.completionBonus,
          recencyPenalty: entry.recencyPenalty,
        })),
      });
    }

    return tx.plan.findUniqueOrThrow({
      where: { id: created.id },
      include: PLAN_INCLUDE,
    });
  });
}

export async function getPlan(id: number) {
  return prisma.plan.findUnique({ where: { id }, include: PLAN_INCLUDE });
}

export async function listPlans(userId: number) {
  return prisma.plan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: PLAN_INCLUDE,
  });
}
