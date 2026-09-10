-- Plan06: additive private AI-learning and server-authoritative game schema.
-- This file is immutable once applied to D1. It intentionally contains no
-- reset, drop, seed or modification of existing learner/curriculum rows.

ALTER TABLE "LearnerProfile" ADD COLUMN "calibrationStatus" TEXT NOT NULL DEFAULT 'UNASSESSED';
ALTER TABLE "LearnerProfile" ADD COLUMN "calibratedAt" DATETIME;

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

CREATE TABLE "PersonalizedLessonVocabulary" (
    "personalizedLessonId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "isTarget" BOOLEAN NOT NULL DEFAULT true,
    "importance" REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY ("personalizedLessonId", "vocabularyItemId"),
    CONSTRAINT "PersonalizedLessonVocabulary_personalizedLessonId_fkey" FOREIGN KEY ("personalizedLessonId") REFERENCES "PersonalizedLesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalizedLessonVocabulary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

CREATE INDEX "PersonalizedLesson_userId_status_createdAt_idx" ON "PersonalizedLesson"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "PersonalizedLesson_userId_targetSkill_sourceSnapshotHash_key" ON "PersonalizedLesson"("userId", "targetSkill", "sourceSnapshotHash");
CREATE UNIQUE INDEX "PersonalizedLesson_userId_generationKey_key" ON "PersonalizedLesson"("userId", "generationKey");
CREATE INDEX "PersonalizedLessonVocabulary_vocabularyItemId_idx" ON "PersonalizedLessonVocabulary"("vocabularyItemId");
CREATE UNIQUE INDEX "PersonalizedLessonAttempt_lessonId_clientAttemptId_key" ON "PersonalizedLessonAttempt"("lessonId", "clientAttemptId");
CREATE INDEX "PersonalizedLessonAttempt_userId_lessonId_createdAt_idx" ON "PersonalizedLessonAttempt"("userId", "lessonId", "createdAt");
CREATE INDEX "AdaptiveGameRun_userId_status_startedAt_idx" ON "AdaptiveGameRun"("userId", "status", "startedAt");
CREATE UNIQUE INDEX "AdaptiveGameRound_runId_position_key" ON "AdaptiveGameRound"("runId", "position");
CREATE UNIQUE INDEX "AdaptiveGameRound_runId_clientAnswerId_key" ON "AdaptiveGameRound"("runId", "clientAnswerId");
CREATE INDEX "AdaptiveGameRound_vocabularyItemId_idx" ON "AdaptiveGameRound"("vocabularyItemId");
CREATE UNIQUE INDEX "AdaptiveEvidence_sourceKind_sourceId_skillKey_key" ON "AdaptiveEvidence"("sourceKind", "sourceId", "skillKey");
CREATE INDEX "AdaptiveEvidence_userId_skillKey_createdAt_idx" ON "AdaptiveEvidence"("userId", "skillKey", "createdAt");
CREATE INDEX "AdaptiveEvidence_userId_vocabularyItemId_createdAt_idx" ON "AdaptiveEvidence"("userId", "vocabularyItemId", "createdAt");
