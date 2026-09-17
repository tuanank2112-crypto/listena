-- Plan13 P130: login throttle (additive, no DROP).
-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectKind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" DATETIME NOT NULL,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthAttempt_subjectKind_subject_key" ON "AuthAttempt"("subjectKind", "subject");
