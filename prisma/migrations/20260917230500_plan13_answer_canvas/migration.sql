-- Plan13 P133 (additive): Answer Canvas assist cost, confidence bet and mode on
-- PersonalizedLessonAttempt. Attempt gained the same confidence/assistMode
-- columns in 20260917230300_plan13_learning_correctness.
-- AlterTable
ALTER TABLE "PersonalizedLessonAttempt" ADD COLUMN "hintCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PersonalizedLessonAttempt" ADD COLUMN "confidence" INTEGER;
ALTER TABLE "PersonalizedLessonAttempt" ADD COLUMN "assistMode" TEXT;
