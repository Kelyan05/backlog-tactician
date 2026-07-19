/*
  Warnings:

  - Added the required column `varietyBonus` to the `PlanEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "genre" TEXT;

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "varietyBonus" DOUBLE PRECISION NOT NULL;
