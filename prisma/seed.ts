import { prisma } from "../src/lib/prisma.ts";
import { getOrCreateOwner } from "../src/lib/currentUser.ts";

const games = [
  { steamAppId: 1145360, name: "Hades", playtimeMinutes: 420, timeToBeatHours: 22, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 504230, name: "Celeste", playtimeMinutes: 180, timeToBeatHours: 9, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 892970, name: "Valheim", playtimeMinutes: 1560, timeToBeatHours: 60, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 1091500, name: "Cyberpunk 2077", playtimeMinutes: 90, timeToBeatHours: 95, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 413150, name: "Stardew Valley", playtimeMinutes: 3200, timeToBeatHours: 52, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 1174180, name: "Red Dead Redemption 2", playtimeMinutes: 0, timeToBeatHours: 49, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 620, name: "Portal 2", playtimeMinutes: 540, timeToBeatHours: 8.5, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 1245620, name: "Elden Ring", playtimeMinutes: 2100, timeToBeatHours: 58, timeToBeatSource: "HowLongToBeat" },
  { steamAppId: 105600, name: "Terraria", playtimeMinutes: 780, timeToBeatHours: null, timeToBeatSource: null },
  { steamAppId: 646570, name: "Slay the Spire", playtimeMinutes: 960, timeToBeatHours: 24, timeToBeatSource: "manual" },
];

async function main() {
  const user = await getOrCreateOwner();

  for (const game of games) {
    await prisma.game.upsert({
      where: { steamAppId: game.steamAppId },
      update: { ...game, userId: user.id },
      create: { ...game, userId: user.id },
    });
  }

  console.log(`Seeded ${games.length} games for user ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
