-- Durable idempotency ledger for POST /api/learning-sessions.
-- A session graph and its COMMITTED transition are written together by the
-- application-level libSQL batch; rows are intentionally retained for replay.
CREATE TABLE "LearningSessionStartRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientStartId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sessionId" TEXT,
    "errorCode" TEXT,
    "errorRetryAfterSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningSessionStartRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningSessionStartRequest_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "LearningSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LearningSessionStartRequest_status_check"
      CHECK ("status" IN ('PENDING', 'COMMITTED', 'FAILED', 'UNKNOWN')),
    CONSTRAINT "LearningSessionStartRequest_committed_session_check"
      CHECK ("status" <> 'COMMITTED' OR "sessionId" IS NOT NULL)
);

CREATE UNIQUE INDEX "LearningSessionStartRequest_userId_clientStartId_key"
  ON "LearningSessionStartRequest"("userId", "clientStartId");

CREATE INDEX "LearningSessionStartRequest_status_updatedAt_idx"
  ON "LearningSessionStartRequest"("status", "updatedAt");

CREATE INDEX "LearningSessionStartRequest_sessionId_idx"
  ON "LearningSessionStartRequest"("sessionId");
