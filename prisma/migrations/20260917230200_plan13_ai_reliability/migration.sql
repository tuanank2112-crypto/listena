-- Plan13 / SPEC-P131 (AI reliability). Additive only: new nullable or
-- defaulted columns plus one partial unique index. No DROP, no data rewrite.

-- Personalized lesson: async generation lease (PL1 + 202/poll flow)
ALTER TABLE "PersonalizedLesson" ADD COLUMN "generationStartedAt" DATETIME;
ALTER TABLE "PersonalizedLesson" ADD COLUMN "generationAttempt" INTEGER NOT NULL DEFAULT 0;

-- AI reservation lease with an explicit expiry (AI1)
ALTER TABLE "AIInteraction" ADD COLUMN "leaseExpiresAt" DATETIME;

-- One graded attempt per exercise per learner (PL2). Prisma cannot express a
-- partial index; schema.prisma carries a comment pointing here.
CREATE UNIQUE INDEX "PersonalizedLessonAttempt_one_graded_per_exercise"
  ON "PersonalizedLessonAttempt"("lessonId", "exerciseId", "userId")
  WHERE "score" IS NOT NULL;
