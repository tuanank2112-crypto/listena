-- CreateTable
CREATE TABLE "PersonalizedLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "targetSkill" TEXT NOT NULL,
    "cefrLevel" TEXT NOT NULL,
    "difficulty" REAL NOT NULL,
    "title" TEXT,
    "objectivesJson" TEXT NOT NULL DEFAULT '[]',
    "contentJson" TEXT,
    "validatorJson" TEXT,
    "sourceSnapshotHash" TEXT NOT NULL,
    "generationKey" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "failureCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME,
    "expiresAt" DATETIME,
    CONSTRAINT "PersonalizedLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalizedLessonVocabulary" (
    "personalizedLessonId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "isTarget" BOOLEAN NOT NULL DEFAULT true,
    "importance" REAL NOT NULL DEFAULT 1.0,

    PRIMARY KEY ("personalizedLessonId", "vocabularyItemId"),
    CONSTRAINT "PersonalizedLessonVocabulary_personalizedLessonId_fkey" FOREIGN KEY ("personalizedLessonId") REFERENCES "PersonalizedLesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalizedLessonVocabulary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalizedLessonAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT,
    "score" REAL NOT NULL,
    "correct" BOOLEAN,
    "feedbackVi" TEXT NOT NULL,
    "gradingMethod" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalizedLessonAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "PersonalizedLesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalizedLessonAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdaptiveGameRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "targetSkill" TEXT NOT NULL,
    "difficulty" REAL NOT NULL,
    "selectionSnapshotHash" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdaptiveGameRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdaptiveGameRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "publicJson" TEXT NOT NULL,
    "validatorJson" TEXT NOT NULL,
    "answeredAt" DATETIME,
    "correct" BOOLEAN,
    "score" REAL,
    "clientAnswerId" TEXT,
    "responseTimeMs" INTEGER,
    "feedbackVi" TEXT,
    CONSTRAINT "AdaptiveGameRound_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AdaptiveGameRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdaptiveGameRound_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdaptiveEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "vocabularyItemId" TEXT,
    "score" REAL NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "difficulty" REAL NOT NULL,
    "gradingMethod" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdaptiveEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdaptiveEvidence_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "estimatedCefrLevel" TEXT NOT NULL DEFAULT 'A2',
    "listeningMastery" REAL NOT NULL DEFAULT 0.5,
    "vocabularyMastery" REAL NOT NULL DEFAULT 0.5,
    "spellingMastery" REAL NOT NULL DEFAULT 0.5,
    "preferredAccent" TEXT DEFAULT 'us',
    "preferredTopics" TEXT NOT NULL DEFAULT '',
    "recommendedPlaybackRate" REAL NOT NULL DEFAULT 1.0,
    "totalStudyMinutes" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "calibrationStatus" TEXT NOT NULL DEFAULT 'UNASSESSED',
    "calibratedAt" DATETIME,
    "lastActivityAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LearnerProfile" ("createdAt", "currentStreak", "estimatedCefrLevel", "id", "lastActivityAt", "listeningMastery", "preferredAccent", "preferredTopics", "recommendedPlaybackRate", "spellingMastery", "totalStudyMinutes", "updatedAt", "userId", "vocabularyMastery") SELECT "createdAt", "currentStreak", "estimatedCefrLevel", "id", "lastActivityAt", "listeningMastery", "preferredAccent", "preferredTopics", "recommendedPlaybackRate", "spellingMastery", "totalStudyMinutes", "updatedAt", "userId", "vocabularyMastery" FROM "LearnerProfile";
DROP TABLE "LearnerProfile";
ALTER TABLE "new_LearnerProfile" RENAME TO "LearnerProfile";
CREATE UNIQUE INDEX "LearnerProfile_userId_key" ON "LearnerProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PersonalizedLesson_userId_status_createdAt_idx" ON "PersonalizedLesson"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizedLesson_userId_targetSkill_sourceSnapshotHash_key" ON "PersonalizedLesson"("userId", "targetSkill", "sourceSnapshotHash");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizedLesson_userId_generationKey_key" ON "PersonalizedLesson"("userId", "generationKey");

-- CreateIndex
CREATE INDEX "PersonalizedLessonVocabulary_vocabularyItemId_idx" ON "PersonalizedLessonVocabulary"("vocabularyItemId");

-- CreateIndex
CREATE INDEX "PersonalizedLessonAttempt_userId_lessonId_createdAt_idx" ON "PersonalizedLessonAttempt"("userId", "lessonId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizedLessonAttempt_lessonId_clientAttemptId_key" ON "PersonalizedLessonAttempt"("lessonId", "clientAttemptId");

-- CreateIndex
CREATE INDEX "AdaptiveGameRun_userId_status_startedAt_idx" ON "AdaptiveGameRun"("userId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AdaptiveGameRound_vocabularyItemId_idx" ON "AdaptiveGameRound"("vocabularyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptiveGameRound_runId_position_key" ON "AdaptiveGameRound"("runId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptiveGameRound_runId_clientAnswerId_key" ON "AdaptiveGameRound"("runId", "clientAnswerId");

-- CreateIndex
CREATE INDEX "AdaptiveEvidence_userId_skillKey_createdAt_idx" ON "AdaptiveEvidence"("userId", "skillKey", "createdAt");

-- CreateIndex
CREATE INDEX "AdaptiveEvidence_userId_vocabularyItemId_createdAt_idx" ON "AdaptiveEvidence"("userId", "vocabularyItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptiveEvidence_sourceKind_sourceId_skillKey_key" ON "AdaptiveEvidence"("sourceKind", "sourceId", "skillKey");
