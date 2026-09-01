-- CreateTable
CREATE TABLE "LearningSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "goal" TEXT NOT NULL,
    "levelSnapshot" TEXT NOT NULL DEFAULT 'A2',
    "stateJson" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "turnType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "skillTags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT,
    "skillKey" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "difficulty" REAL NOT NULL DEFAULT 1.0,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningEvidence_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "LearningTurn" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sourceTurnId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "specJson" TEXT NOT NULL,
    "validatorJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outcomeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Intervention_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Intervention_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "LearningTurn" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sessionId" TEXT,
    "turnId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "promptVersion" TEXT,
    "inputHash" TEXT,
    "validatedOutput" TEXT,
    "latencyMs" INTEGER,
    "timeToFirstTokenMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" REAL,
    "fallbackReason" TEXT,
    "schemaValid" BOOLEAN NOT NULL DEFAULT true,
    "traceId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIInteraction_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "LearningTurn" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AIInteraction" ("createdAt", "id", "inputHash", "latencyMs", "model", "promptVersion", "purpose", "success", "userId", "validatedOutput") SELECT "createdAt", "id", "inputHash", "latencyMs", "model", "promptVersion", "purpose", "success", "userId", "validatedOutput" FROM "AIInteraction";
DROP TABLE "AIInteraction";
ALTER TABLE "new_AIInteraction" RENAME TO "AIInteraction";
CREATE INDEX "AIInteraction_createdAt_idx" ON "AIInteraction"("createdAt");
CREATE INDEX "AIInteraction_purpose_success_idx" ON "AIInteraction"("purpose", "success");
CREATE INDEX "AIInteraction_sessionId_createdAt_idx" ON "AIInteraction"("sessionId", "createdAt");
CREATE INDEX "AIInteraction_traceId_idx" ON "AIInteraction"("traceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LearningSession_userId_status_updatedAt_idx" ON "LearningSession"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LearningSession_lessonId_status_idx" ON "LearningSession"("lessonId", "status");

-- CreateIndex
CREATE INDEX "LearningTurn_sessionId_createdAt_idx" ON "LearningTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningTurn_sessionId_sequence_key" ON "LearningTurn"("sessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LearningTurn_sessionId_clientTurnId_key" ON "LearningTurn"("sessionId", "clientTurnId");

-- CreateIndex
CREATE INDEX "LearningEvidence_sessionId_createdAt_idx" ON "LearningEvidence"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningEvidence_skillKey_createdAt_idx" ON "LearningEvidence"("skillKey", "createdAt");

-- CreateIndex
CREATE INDEX "Intervention_sessionId_status_idx" ON "Intervention"("sessionId", "status");
