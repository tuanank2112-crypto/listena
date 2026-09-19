-- Plan22 SPEC-P221 (additive): the Vocab Master lesson journey.
--
-- Two changes, both additive, so an older deploy keeps working against this
-- schema: a table recording which steps of a lesson a learner has finished, and
-- a nullable lessonId on AdaptiveGameRun so a run started from a lesson knows
-- which lesson it belongs to. Existing free-play runs keep lessonId NULL.

-- CreateTable
CREATE TABLE "LessonJourneyProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceRef" TEXT,
    CONSTRAINT "LessonJourneyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonJourneyProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonJourneyProgress_userId_lessonId_step_key" ON "LessonJourneyProgress"("userId", "lessonId", "step");

-- CreateIndex
CREATE INDEX "LessonJourneyProgress_userId_lessonId_idx" ON "LessonJourneyProgress"("userId", "lessonId");

-- AlterTable
ALTER TABLE "AdaptiveGameRun" ADD COLUMN "lessonId" TEXT REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AdaptiveGameRun_userId_lessonId_status_idx" ON "AdaptiveGameRun"("userId", "lessonId", "status");
