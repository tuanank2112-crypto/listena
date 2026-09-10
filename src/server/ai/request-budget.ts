import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { executeNativeD1Batch, d1Boolean, d1Timestamp } from "@/lib/d1-batch";
import { getNativeD1Database, prisma } from "@/lib/prisma";
import {
  AIRequestBudgetError,
  type AIProviderFailureReason,
} from "@/server/ai/errors";

export const AI_REQUEST_MIN_INTERVAL_MS = 12_000;
export const AI_REQUEST_DAILY_LIMIT = 40;
export const AI_REQUEST_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const AI_REQUEST_PENDING_LEASE_MS = 30_000;

// Mission starts/turns are one learning sequence: after an AI reply or a
// completed Mission, a learner must be able to continue without an arbitrary
// 12-second dead zone. Their one-at-a-time lease and shared daily cap still
// apply. Provisioning and one-off tutor/admin calls retain the cooldown
// against burst clicking.
const COOLDOWN_EXEMPT_PURPOSES = new Set(["start_mission", "evaluate_turn"]);

type ReservationRow = {
  createdAt: Date;
  fallbackReason: string | null;
};

export type AICallReservation = {
  id: string;
  userId: string;
  purpose: string;
};

type AICallBudgetDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ACTIVE" | "COOLDOWN" | "DAILY_LIMIT";
      retryAfterSeconds: number;
    };

/**
 * Reserves one real upstream AI call before it is made. The Worker path uses a
 * single conditional D1 insert, so separate isolates cannot all pass a stale
 * read and exhaust the shared account quota at once.
 */
export async function reserveUserAICall(input: {
  userId: string;
  purpose: string;
  requestIdentity?: string;
  provider?: string;
  model?: string;
  now?: Date;
}): Promise<AICallReservation> {
  const now = input.now ?? new Date();
  const id = randomUUID();
  const inputHash = hashValue(
    `${input.userId}:${input.purpose}:${input.requestIdentity ?? randomUUID()}`,
  );
  const reservation: AICallReservation = {
    id,
    userId: input.userId,
    purpose: input.purpose,
  };

  if (getNativeD1Database()) {
    const result = await executeNativeD1Batch([
      nativeReservationInsert({
        ...input,
        id,
        inputHash,
        now,
      }),
    ]);
    if (result[0]?.meta.changes === 1) return reservation;
    const decision = evaluateAICallBudget(
      await listRecentReservations(input.userId, now),
      now,
      input.purpose,
    );
    if (!decision.allowed) throw new AIRequestBudgetError(decision);
    // A competing Worker can commit in the tiny interval between the native
    // conditional insert and this diagnostic read. Never fall back to Prisma
    // in that case, or the atomic D1 fence would be bypassed.
    throw new AIRequestBudgetError({ reason: "ACTIVE", retryAfterSeconds: 1 });
  }

  const recent = await listRecentReservations(input.userId, now);
  throwBudgetLimit(recent, now, input.purpose);
  await prisma.aIInteraction.create({
    data: {
      id,
      userId: input.userId,
      purpose: "ai_call_reservation",
      provider: input.provider ?? null,
      model: input.model ?? null,
      inputHash,
      fallbackReason: pendingReason(input.purpose),
      schemaValid: false,
      success: false,
      createdAt: now,
    },
  });
  return reservation;
}

/** Finalizes the lease without storing prompt or learner text in this ledger. */
export async function settleUserAICall(
  reservation: AICallReservation,
  outcome: {
    success: boolean;
    provider?: string;
    model?: string;
    requestId?: string;
    failureReason?: AIProviderFailureReason | "unknown";
  },
) {
  const fallbackReason = outcome.success
    ? succeededReason(reservation.purpose)
    : failedReason(reservation.purpose, outcome.failureReason);
  const provider = safeMetadata(outcome.provider);
  const model = safeMetadata(outcome.model);
  const requestId = safeMetadata(outcome.requestId);

  if (getNativeD1Database()) {
    await executeNativeD1Batch([
      {
        sql: `UPDATE "AIInteraction"
              SET "provider" = ?, "model" = ?, "traceId" = ?,
                  "fallbackReason" = ?, "schemaValid" = ?, "success" = ?
              WHERE "id" = ? AND "userId" = ? AND "purpose" = ?
                AND "fallbackReason" LIKE 'AI_CALL_PENDING:%'`,
        values: [
          provider,
          model,
          requestId,
          fallbackReason,
          d1Boolean(outcome.success),
          d1Boolean(outcome.success),
          reservation.id,
          reservation.userId,
          "ai_call_reservation",
        ],
      },
    ]);
    return;
  }

  await prisma.aIInteraction.updateMany({
    where: {
      id: reservation.id,
      userId: reservation.userId,
      purpose: "ai_call_reservation",
      fallbackReason: { startsWith: "AI_CALL_PENDING:" },
    },
    data: {
      provider,
      model,
      traceId: requestId,
      fallbackReason,
      schemaValid: outcome.success,
      success: outcome.success,
    },
  });
}

export function evaluateAICallBudget(
  rows: ReservationRow[],
  now: Date,
  purpose?: string,
): AICallBudgetDecision {
  const nowMs = now.getTime();
  const withinWindow = rows
    .map((row) => ({
      at: row.createdAt.getTime(),
      pending: row.fallbackReason?.startsWith("AI_CALL_PENDING:") ?? false,
      fallbackReason: row.fallbackReason,
    }))
    .filter((row) => Number.isFinite(row.at) && row.at > nowMs - AI_REQUEST_ROLLING_WINDOW_MS)
    .sort((left, right) => right.at - left.at);

  const pending = withinWindow.find(
    (row) => row.pending && nowMs - row.at < AI_REQUEST_PENDING_LEASE_MS,
  );
  if (pending) {
    return {
      allowed: false,
      reason: "ACTIVE",
      retryAfterSeconds: boundedRetry(
        AI_REQUEST_PENDING_LEASE_MS - (nowMs - pending.at),
      ),
    };
  }

  if (withinWindow.length >= AI_REQUEST_DAILY_LIMIT) {
    const oldestAllowed = withinWindow[AI_REQUEST_DAILY_LIMIT - 1]!;
    return {
      allowed: false,
      reason: "DAILY_LIMIT",
      retryAfterSeconds: boundedRetry(
        oldestAllowed.at + AI_REQUEST_ROLLING_WINDOW_MS - nowMs,
      ),
    };
  }

  const newest = purpose && cooldownApplies(purpose)
    ? withinWindow.find((row) => reservationPurpose(row.fallbackReason) === purpose)
    : purpose
      ? undefined
      : withinWindow[0];
  if (newest && nowMs - newest.at < AI_REQUEST_MIN_INTERVAL_MS) {
    return {
      allowed: false,
      reason: "COOLDOWN",
      retryAfterSeconds: boundedRetry(
        AI_REQUEST_MIN_INTERVAL_MS - (nowMs - newest.at),
      ),
    };
  }
  return { allowed: true };
}

function nativeReservationInsert(input: {
  id: string;
  userId: string;
  purpose: string;
  provider?: string;
  model?: string;
  inputHash: string;
  now: Date;
}) {
  const createdAt = d1Timestamp(input.now);
  const windowStart = d1Timestamp(
    new Date(input.now.getTime() - AI_REQUEST_ROLLING_WINDOW_MS),
  );
  const cooldownStart = d1Timestamp(
    new Date(input.now.getTime() - AI_REQUEST_MIN_INTERVAL_MS),
  );
  const pendingStart = d1Timestamp(
    new Date(input.now.getTime() - AI_REQUEST_PENDING_LEASE_MS),
  );
  const cooldownPredicate = cooldownApplies(input.purpose)
    ? `AND NOT EXISTS (
              SELECT 1 FROM "AIInteraction"
              WHERE "userId" = ? AND "purpose" = 'ai_call_reservation'
                AND "createdAt" > ?
                AND (
                  "fallbackReason" = ?
                  OR "fallbackReason" = ?
                  OR "fallbackReason" LIKE ?
                )
            )`
    : "";
  const cooldownValues = cooldownApplies(input.purpose)
    ? [
        input.userId,
        cooldownStart,
        pendingReason(input.purpose),
        succeededReason(input.purpose),
        `${failedReasonPrefix(input.purpose)}%`,
      ]
    : [];
  return {
    sql: `INSERT INTO "AIInteraction"
            ("id", "userId", "purpose", "provider", "model", "inputHash", "fallbackReason", "schemaValid", "success", "createdAt")
          SELECT ?, ?, 'ai_call_reservation', ?, ?, ?, ?, 0, 0, ?
          WHERE
            (SELECT COUNT(*) FROM "AIInteraction"
             WHERE "userId" = ? AND "purpose" = 'ai_call_reservation'
               AND "createdAt" > ?) < ?
            AND NOT EXISTS (
              SELECT 1 FROM "AIInteraction"
              WHERE "userId" = ? AND "purpose" = 'ai_call_reservation'
                AND "fallbackReason" LIKE 'AI_CALL_PENDING:%'
                AND "createdAt" > ?
            )
            ${cooldownPredicate}`,
    values: [
      input.id,
      input.userId,
      safeMetadata(input.provider),
      safeMetadata(input.model),
      input.inputHash,
      pendingReason(input.purpose),
      createdAt,
      input.userId,
      windowStart,
      AI_REQUEST_DAILY_LIMIT,
      input.userId,
      pendingStart,
      ...cooldownValues,
    ],
  };
}

async function listRecentReservations(userId: string, now: Date) {
  return prisma.aIInteraction.findMany({
    where: {
      userId,
      purpose: "ai_call_reservation",
      createdAt: {
        gt: new Date(now.getTime() - AI_REQUEST_ROLLING_WINDOW_MS),
      },
    },
    orderBy: { createdAt: "desc" },
    take: AI_REQUEST_DAILY_LIMIT,
    select: { createdAt: true, fallbackReason: true },
  });
}

function throwBudgetLimit(rows: ReservationRow[], now: Date, purpose: string) {
  const decision = evaluateAICallBudget(rows, now, purpose);
  if (decision.allowed) return;
  throw new AIRequestBudgetError(decision);
}

function pendingReason(purpose: string) {
  return `AI_CALL_PENDING:${purpose.slice(0, 80)}`;
}

function succeededReason(purpose: string) {
  return `AI_CALL_SUCCEEDED:${purpose.slice(0, 80)}`;
}

function failedReason(purpose: string, reason: string | undefined) {
  return `${failedReasonPrefix(purpose)}${(reason ?? "unknown").slice(0, 80)}`;
}

function failedReasonPrefix(purpose: string) {
  return `AI_CALL_FAILED:${purpose.slice(0, 80)}:`;
}

function cooldownApplies(purpose: string) {
  return !COOLDOWN_EXEMPT_PURPOSES.has(purpose);
}

function reservationPurpose(fallbackReason: string | null) {
  const settled = /^AI_CALL_(?:PENDING|SUCCEEDED):([^:]+)$/.exec(
    fallbackReason ?? "",
  );
  if (settled?.[1]) return settled[1];
  return /^AI_CALL_FAILED:([^:]+):/.exec(fallbackReason ?? "")?.[1];
}

function safeMetadata(value: string | undefined) {
  return value?.slice(0, 256) ?? null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedRetry(milliseconds: number) {
  return Math.max(
    1,
    Math.min(
      Math.ceil(Math.max(0, milliseconds) / 1_000),
      Math.ceil(AI_REQUEST_ROLLING_WINDOW_MS / 1_000),
    ),
  );
}
