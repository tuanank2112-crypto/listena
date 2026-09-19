-- Plan23 SPEC-P232 (additive): mission scenarios a learner asks for.
--
-- The three built-in scenarios stay in code. This table holds the ones the AI
-- writes from a learner's own words, owned by that learner. Purely additive, so
-- an older deploy keeps working against this schema.

-- CreateTable
CREATE TABLE "LearnerMissionScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourcePrompt" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "npcName" TEXT NOT NULL,
    "npcRole" TEXT NOT NULL,
    "learnerGoal" TEXT NOT NULL,
    "openingLine" TEXT NOT NULL,
    "firstPrompt" TEXT NOT NULL,
    "targetVocabularyJson" TEXT NOT NULL DEFAULT '[]',
    "targetGrammarJson" TEXT NOT NULL DEFAULT '[]',
    "maxTurns" INTEGER NOT NULL DEFAULT 7,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnerMissionScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LearnerMissionScenario_userId_archivedAt_createdAt_idx" ON "LearnerMissionScenario"("userId", "archivedAt", "createdAt");
