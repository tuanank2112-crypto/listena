-- One PENDING start request is the durable pre-provider lease for a learner's
-- primary session. Earlier application versions permitted concurrent distinct
-- keys; preserve the newest ambiguous request and mark older contenders
-- UNKNOWN before installing the additive partial unique index. An UNKNOWN row
-- cannot commit a session graph because the graph fence requires PENDING.
UPDATE "LearningSessionStartRequest" AS "older"
SET "status" = 'UNKNOWN',
    "errorCode" = COALESCE("errorCode", 'START_OUTCOME_UNKNOWN'),
    "errorRetryAfterSeconds" = NULL
WHERE "status" = 'PENDING'
  AND EXISTS (
    SELECT 1
    FROM "LearningSessionStartRequest" AS "newer"
    WHERE "newer"."userId" = "older"."userId"
      AND "newer"."status" = 'PENDING'
      AND (
        COALESCE(
          CASE
            WHEN typeof("newer"."updatedAt") IN ('integer', 'real')
              THEN 2440587.5 + CAST("newer"."updatedAt" AS REAL) / 86400000.0
            ELSE julianday("newer"."updatedAt")
          END,
          0
        ) > COALESCE(
          CASE
            WHEN typeof("older"."updatedAt") IN ('integer', 'real')
              THEN 2440587.5 + CAST("older"."updatedAt" AS REAL) / 86400000.0
            ELSE julianday("older"."updatedAt")
          END,
          0
        )
        OR (
          COALESCE(
            CASE
              WHEN typeof("newer"."updatedAt") IN ('integer', 'real')
                THEN 2440587.5 + CAST("newer"."updatedAt" AS REAL) / 86400000.0
              ELSE julianday("newer"."updatedAt")
            END,
            0
          ) = COALESCE(
            CASE
              WHEN typeof("older"."updatedAt") IN ('integer', 'real')
                THEN 2440587.5 + CAST("older"."updatedAt" AS REAL) / 86400000.0
              ELSE julianday("older"."updatedAt")
            END,
            0
          )
          AND "newer"."id" > "older"."id"
        )
      )
  );

CREATE UNIQUE INDEX "LearningSessionStartRequest_one_pending_per_user"
  ON "LearningSessionStartRequest"("userId")
  WHERE "status" = 'PENDING';
