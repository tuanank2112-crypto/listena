-- Plan13 P132/P133 (additive): Answer Canvas confidence bet and assist mode on Attempt.
-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "confidence" INTEGER;
ALTER TABLE "Attempt" ADD COLUMN "assistMode" TEXT;
