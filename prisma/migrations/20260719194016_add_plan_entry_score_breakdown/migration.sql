/*
  Warnings:

  - Added the required column `completionBonus` to the `PlanEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recencyPenalty` to the `PlanEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `score` to the `PlanEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "completionBonus" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "recencyPenalty" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "score" DOUBLE PRECISION NOT NULL;
