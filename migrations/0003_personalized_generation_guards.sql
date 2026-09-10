-- Plan06: bounded lookup for per-learner live-generation guard.
-- Additive only; no existing data is modified or removed.
CREATE INDEX "AIInteraction_userId_purpose_createdAt_idx"
ON "AIInteraction"("userId", "purpose", "createdAt");
