-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "clientAttemptId" TEXT;
ALTER TABLE "Attempt" ADD COLUMN "requestHash" TEXT;

-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN "clientReviewId" TEXT;
ALTER TABLE "ReviewLog" ADD COLUMN "requestHash" TEXT;

-- CreateTable
CREATE TABLE "LessonCreationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lessonId" TEXT,
    "errorCode" TEXT,
    "leaseExpiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LessonCreationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonCreationRequest_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VocabularyMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "masteryScore" REAL NOT NULL DEFAULT 0.0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" REAL NOT NULL DEFAULT 0.0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitionCount" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VocabularyMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularyMastery_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyMastery" ("correctCount", "easeFactor", "id", "incorrectCount", "intervalDays", "lastReviewedAt", "masteryScore", "nextReviewAt", "repetitionCount", "userId", "vocabularyItemId") SELECT "correctCount", "easeFactor", "id", "incorrectCount", "intervalDays", "lastReviewedAt", "masteryScore", "nextReviewAt", "repetitionCount", "userId", "vocabularyItemId" FROM "VocabularyMastery";
DROP TABLE "VocabularyMastery";
ALTER TABLE "new_VocabularyMastery" RENAME TO "VocabularyMastery";
CREATE INDEX "VocabularyMastery_userId_nextReviewAt_idx" ON "VocabularyMastery"("userId", "nextReviewAt");
CREATE UNIQUE INDEX "VocabularyMastery_userId_vocabularyItemId_key" ON "VocabularyMastery"("userId", "vocabularyItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LessonCreationRequest_userId_status_createdAt_idx" ON "LessonCreationRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonCreationRequest_userId_clientRequestId_key" ON "LessonCreationRequest"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_clientAttemptId_key" ON "Attempt"("userId", "clientAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLog_userId_clientReviewId_key" ON "ReviewLog"("userId", "clientReviewId");
