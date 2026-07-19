-- DropIndex
DROP INDEX "Game_steamAppId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "steamId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Game_userId_steamAppId_key" ON "Game"("userId", "steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");
