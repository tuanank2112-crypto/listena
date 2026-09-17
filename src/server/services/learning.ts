/**
 * Core learning service: submit attempt, analyze, update profile, create flashcards.
 * Hardened under Plan 10 P102 with atomic libSQL batch persistence and request idempotency.
 * Plan13 P132: mastery fractions (L1), lesson binding (L4), flashcard reuse (L5),
 * deterministic finalize of stale enrichment (L6/D1), receipt ids, expected-only vocabulary.
 */

import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { assessDictation, assessOpenResponse } from "@/core/assessment/engine";
import { updateMastery } from "@/core/learner-model/mastery";
import { processReview } from "@/core/srs/sm2";
import { createAIProviderFromEnv } from "@/server/ai/provider";
import { isAIProviderError } from "@/server/ai/errors";
import {
  reserveUserAICall,
  settleUserAICall,
} from "@/server/ai/request-budget";
import type { AIFeedbackResponse } from "@/server/validation/schemas";
import { prisma } from "@/lib/prisma";
import {
  libSqlTimestamp,
  libSqlBoolean,
  rowAs,
  withLibSqlWriteTransaction,
} from "@/lib/libsql-batch";
import {
  hashCanonicalPayload,
  type IdempotentResult,
  IdempotencyConflictError,
  LegacyResultUnavailableError,
  OutcomePendingError,
} from "@/lib/idempotency";
import logger from "@/lib/logger";
import {
  SKILL_LISTENING,
  SKILL_VOCABULARY,
  SKILL_SPELLING,
  SKILL_FUNCTION_WORDS,
} from "@/core/constants";

/**
 * Open-response enrichment lease. The provider timeout is 180s, so the lease
 * must outlive the longest possible `analyzeErrors` call (Plan13 invariant:
 * lease/fence > longest call). A replay past this lease finalizes the row
 * deterministically instead of waiting forever.
 */
export const ENRICHMENT_LEASE_MS = 210_000;
export const ENRICHMENT_RETRY_AFTER_SECONDS = 30;

/** Only words that come from the expected answer become vocabulary items. */
export const VOCABULARY_LEMMA_PATTERN = /^[\p{L}'-]{2,}$/u;

export interface SubmitAttemptParams {
  userId: string;
  exerciseId: string;
  lessonId: string;
  submittedAnswer: string;
  completionTimeMs?: number;
  replayCount: number;
  hintCount: number;
  playbackRate: number;
  clientAttemptId?: string;
  /** Answer Canvas confidence bet 1..3 (P133); null when the learner did not bet. */
  confidence?: number | null;
  /** Answer Canvas assist mode 'FREE' | 'TILES' | 'SKELETON' (P133). */
  assistMode?: string | null;
}

export type SubmitAttemptResult = {
  attemptId: string;
  attempt: {
    id: string;
    userId: string;
    lessonId: string;
    exerciseId: string;
    submittedAnswer: string;
    normalizedAnswer: string | null;
    score: number | null;
    completionTimeMs: number | null;
    replayCount: number;
    hintCount: number;
    playbackRate: number;
    clientAttemptId: string | null;
    requestHash: string | null;
    confidence?: number | null;
    assistMode?: string | null;
    createdAt: Date;
  };
  assessment: {
    overallScore: number;
    normalizedActual: string;
    wordDiffs: Array<{ type: string; expected?: string | null; actual?: string | null; position?: number }>;
    errors: Array<{
      type: string;
      expected: string;
      actual?: string | null;
      position: number;
      confidence: number;
    }>;
    spellingAccuracy: number;
    contentWordAccuracy: number;
    functionWordAccuracy: number;
  };
  aiFeedback: AIFeedbackResponse | null;
  aiFeedbackStatus: "available" | "unavailable" | "rate_limited" | "not_requested";
  flashcardIds: string[];
};

export type SerializedAttemptReceiptV1 = {
  version: "attempt-result-v1";
  result: SubmitAttemptResult;
};

type ExistingAttemptRow = {
  id: string;
  userId: string;
  lessonId: string;
  exerciseId: string;
  submittedAnswer: string;
  normalizedAnswer: string | null;
  score: number | null;
  completionTimeMs: number | null;
  replayCount: number;
  hintCount: number;
  playbackRate: number;
  clientAttemptId: string | null;
  requestHash: string | null;
  resultJson: string | null;
  enrichmentState: string;
  enrichmentLeaseId: string | null;
  enrichmentLeaseExpiresAt: Date | string | number | null;
  createdAt: Date | string | number;
  confidence?: number | null;
  assistMode?: string | null;
};

type StoredAttemptError = {
  errorType: string;
  expectedText: string | null;
  actualText: string | null;
  position: number;
  confidence: number;
};

const EXISTING_ATTEMPT_COLUMNS = `"id", "userId", "lessonId", "exerciseId", "submittedAnswer", "normalizedAnswer",
  "score", "completionTimeMs", "replayCount", "hintCount", "playbackRate", "clientAttemptId", "requestHash",
  "resultJson", "enrichmentState", "enrichmentLeaseId", "enrichmentLeaseExpiresAt", "createdAt",
  "confidence", "assistMode"`;

function parseReceipt(resultJson: string): SubmitAttemptResult | null {
  try {
    const parsed = JSON.parse(resultJson) as SerializedAttemptReceiptV1;
    if (!parsed?.result?.attempt) return null;
    if (parsed.result.attempt.createdAt) {
      parsed.result.attempt.createdAt = new Date(parsed.result.attempt.createdAt);
    }
    return parsed.result;
  } catch {
    return null;
  }
}

function leaseExpired(expiresAt: Date | string | number | null, now: number) {
  if (expiresAt === null || expiresAt === undefined) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || now >= expiresMs;
}

/**
 * Plan13 L1 guard: the assessment accuracies are fractions in [0, 1]. Anything
 * else is a programming error; warn loudly and clamp so mastery never runs away.
 */
function unitFraction(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    logger.warn({ label, value }, "Assessment accuracy outside [0, 1]; clamping");
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }
  return value;
}

/**
 * Plan13 L6/D1: an open-response attempt whose enrichment lease has expired is
 * finalized from the data already committed in `Attempt` + `AttemptError`.
 * The UPDATE is fenced on the lease id the caller observed; it must affect
 * exactly one row or the outcome is reported as unavailable.
 */
async function finalizeStaleEnrichment(
  tx: Pick<Transaction, "execute">,
  existing: ExistingAttemptRow,
): Promise<SubmitAttemptResult> {
  const errorRows = await tx.execute({
    sql: `SELECT "errorType", "expectedText", "actualText", "position", "confidence"
          FROM "AttemptError" WHERE "attemptId" = ? ORDER BY "position" ASC`,
    args: [existing.id],
  });
  // Flashcard ids are re-derived the same way the core commit resolved them:
  // one active card per (userId, vocabularyItemId) for every expected error
  // word, in first-seen order (reused cards carry another sourceAttemptId).
  const storedErrors = errorRows.rows.map((row) => rowAs<StoredAttemptError>(row));
  const errorLemmas = [...new Set(
    storedErrors
      .map((error) => (error.expectedText ?? "").trim())
      .filter((word) => word && VOCABULARY_LEMMA_PATTERN.test(word))
      .map((word) => word.toLocaleLowerCase("en")),
  )];
  const flashcardIds: string[] = [];
  for (const lemma of errorLemmas) {
    const cardRows = await tx.execute({
      sql: `SELECT "Flashcard"."id" AS "id" FROM "Flashcard"
            INNER JOIN "VocabularyItem" ON "VocabularyItem"."id" = "Flashcard"."vocabularyItemId"
            WHERE "Flashcard"."userId" = ? AND "Flashcard"."active" = ? AND "VocabularyItem"."lemma" = ?
            ORDER BY "Flashcard"."createdAt" ASC, "Flashcard"."id" ASC LIMIT 1`,
      args: [existing.userId, libSqlBoolean(true), lemma],
    });
    if (cardRows.rows[0]) {
      flashcardIds.push(String(rowAs<{ id: string }>(cardRows.rows[0]).id));
    }
  }

  const score = existing.score === null || existing.score === undefined ? 0 : Number(existing.score);
  const accuracy = unitFraction(score / 100, "stale-finalize.accuracy");
  const result: SubmitAttemptResult = {
    attemptId: existing.id,
    attempt: {
      id: existing.id,
      userId: existing.userId,
      lessonId: existing.lessonId,
      exerciseId: existing.exerciseId,
      submittedAnswer: existing.submittedAnswer,
      normalizedAnswer: existing.normalizedAnswer,
      score: existing.score === null || existing.score === undefined ? null : Number(existing.score),
      completionTimeMs: existing.completionTimeMs === null || existing.completionTimeMs === undefined
        ? null
        : Number(existing.completionTimeMs),
      replayCount: Number(existing.replayCount),
      hintCount: Number(existing.hintCount),
      playbackRate: Number(existing.playbackRate),
      clientAttemptId: existing.clientAttemptId,
      requestHash: existing.requestHash,
      confidence: existing.confidence === undefined || existing.confidence === null ? null : Number(existing.confidence),
      assistMode: existing.assistMode ?? null,
      createdAt: new Date(existing.createdAt),
    },
    assessment: {
      overallScore: score,
      normalizedActual: existing.normalizedAnswer ?? "",
      wordDiffs: [],
      errors: storedErrors.map((error) => ({
        type: error.errorType,
        expected: error.expectedText ?? "",
        actual: error.actualText,
        position: Number(error.position),
        confidence: Number(error.confidence),
      })),
      spellingAccuracy: accuracy,
      contentWordAccuracy: accuracy,
      functionWordAccuracy: accuracy,
    },
    aiFeedback: null,
    aiFeedbackStatus: "unavailable",
    flashcardIds,
  };

  const receipt: SerializedAttemptReceiptV1 = { version: "attempt-result-v1", result };
  const update = await tx.execute({
    sql: `UPDATE "Attempt" SET "enrichmentState" = 'SKIPPED', "resultJson" = ?
          WHERE "id" = ? AND "userId" = ? AND "enrichmentState" = 'PENDING' AND "enrichmentLeaseId" IS ?`,
    args: [JSON.stringify(receipt), existing.id, existing.userId, existing.enrichmentLeaseId],
  });

  if (Number(update.rowsAffected) !== 1) {
    // Someone else (the original enrichment or another replay) finalized first;
    // surface whatever they committed rather than a second, diverging receipt.
    const reread = await tx.execute({
      sql: `SELECT "resultJson" FROM "Attempt" WHERE "id" = ? AND "userId" = ?`,
      args: [existing.id, existing.userId],
    });
    const resultJson = reread.rows[0] ? rowAs<{ resultJson: string | null }>(reread.rows[0]).resultJson : null;
    const parsed = resultJson ? parseReceipt(resultJson) : null;
    if (parsed) return parsed;
    logger.error(
      { attemptId: existing.id, rowsAffected: Number(update.rowsAffected) },
      "Stale enrichment finalize did not update exactly one row"
    );
    throw new LegacyResultUnavailableError();
  }

  logger.warn(
    { attemptId: existing.id, clientAttemptId: existing.clientAttemptId },
    "Enrichment lease expired; finalized attempt deterministically without AI copy"
  );
  return result;
}

/**
 * Shared replay policy for an already-committed attempt row. Returns the
 * receipt, or finalizes a stale PENDING row, or throws the typed error.
 */
async function replayExistingAttempt(
  existing: ExistingAttemptRow,
  requestHash: string,
  runFinalize: (run: (tx: Pick<Transaction, "execute">) => Promise<SubmitAttemptResult>) => Promise<SubmitAttemptResult>,
): Promise<SubmitAttemptResult> {
  if (existing.requestHash !== requestHash) {
    throw new IdempotencyConflictError(
      "Client attempt ID already used with a different request payload"
    );
  }

  const pending = existing.enrichmentState === "PENDING";
  if (pending && !leaseExpired(existing.enrichmentLeaseExpiresAt, Date.now())) {
    throw new OutcomePendingError(
      ENRICHMENT_RETRY_AFTER_SECONDS,
      "AI feedback enrichment pending; retry with the same client ID"
    );
  }

  if (existing.resultJson) {
    const parsed = parseReceipt(existing.resultJson);
    if (parsed) return parsed;
  }

  if (pending) {
    // Lease expired and no receipt: finalize from the committed data (L6/D1).
    return runFinalize((tx) => finalizeStaleEnrichment(tx, existing));
  }

  throw new LegacyResultUnavailableError();
}

export async function submitAttempt(
  params: SubmitAttemptParams
): Promise<IdempotentResult<SubmitAttemptResult>> {
  const startTime = Date.now();
  const clientAttemptId = params.clientAttemptId ?? randomUUID();
  const confidence = params.confidence ?? null;
  const assistMode = params.assistMode ?? null;

  logger.info(
    { userId: params.userId, exerciseId: params.exerciseId, clientAttemptId },
    "Submitting attempt"
  );

  // 1. Compute canonical request hash. Answer Canvas fields only enter the hash
  // when present so receipts written before P133 keep replaying.
  const canonicalPayload = {
    exerciseId: params.exerciseId,
    lessonId: params.lessonId,
    submittedAnswer: params.submittedAnswer.trim(),
    completionTimeMs: params.completionTimeMs ?? null,
    replayCount: params.replayCount,
    hintCount: params.hintCount,
    playbackRate: params.playbackRate,
    ...(confidence !== null ? { confidence } : {}),
    ...(assistMode !== null ? { assistMode } : {}),
  };
  const requestHash = hashCanonicalPayload(canonicalPayload);

  // 2. Check for existing attempt with same clientAttemptId (idempotent replay)
  const existingAttempt = await prisma.attempt.findUnique({
    where: {
      userId_clientAttemptId: {
        userId: params.userId,
        clientAttemptId,
      },
    },
  });

  if (existingAttempt) {
    const value = await replayExistingAttempt(
      existingAttempt as ExistingAttemptRow,
      requestHash,
      (run) => withLibSqlWriteTransaction(run),
    );
    return { replayed: true, value };
  }

  // 3. Fresh attempt: Get exercise and lesson, validating published status
  const exercise = await prisma.exercise.findUnique({
    where: { id: params.exerciseId },
    include: { lesson: true },
  });

  if (!exercise || exercise.lesson.status !== "PUBLISHED") {
    throw new Error("Exercise not found");
  }
  // Plan13 L4: an attempt is always written against the exercise's own lesson.
  if (exercise.lessonId !== params.lessonId) {
    throw new Error("Exercise does not belong to the lesson");
  }

  // 4. Run assessment
  let metadata: { answerMode?: string } = {};
  try {
    metadata = JSON.parse(exercise.metadata || "{}") as { answerMode?: string };
  } catch {
    metadata = {};
  }
  const isOpenResponse = metadata.answerMode === "open";
  const assessment = isOpenResponse
    ? assessOpenResponse(params.submittedAnswer)
    : assessDictation(exercise.correctAnswer, params.submittedAnswer);

  // 5. Pre-resolve vocabulary items outside the batch. Only words from the
  // expected answer qualify (Plan13): an EXTRA_WORD has no expected text and a
  // learner's typo must never become a global VocabularyItem.
  const errorWords: string[] = [];
  for (const error of assessment.errors) {
    const word = (error.expected ?? "").trim();
    if (!word) continue;
    if (!VOCABULARY_LEMMA_PATTERN.test(word)) continue;
    errorWords.push(word);
  }

  const uniqueWords = [...new Set(errorWords.map((w) => w.toLocaleLowerCase("en")))];
  const vocabMap = new Map<string, string>();
  for (const lemma of uniqueWords) {
    const origWord = errorWords.find((w) => w.toLocaleLowerCase("en") === lemma) ?? lemma;
    const item = await prisma.vocabularyItem.upsert({
      where: { lemma },
      create: {
        lemma,
        displayText: origWord,
        meaningVi: origWord,
        meaningEn: origWord,
        cefrLevel: "A2",
      },
      update: {},
    });
    vocabMap.set(lemma, item.id);
  }

  const attemptId = randomUUID();
  const now = new Date();
  const nowTs = libSqlTimestamp(now);

  type CoreCommitOutcome =
    | {
        replayed: true;
        value: SubmitAttemptResult;
        enrichmentLeaseId: null;
      }
    | {
        replayed: false;
        value: SubmitAttemptResult;
        enrichmentLeaseId: string | null;
      };

  // 6. Execute core commit inside withLibSqlWriteTransaction
  let coreResult: CoreCommitOutcome;

  try {
    coreResult = await withLibSqlWriteTransaction(async (tx) => {
    // Re-check existing in tx in case of concurrent insert race
    const existingCheck = await tx.execute({
      sql: `SELECT ${EXISTING_ATTEMPT_COLUMNS} FROM "Attempt" WHERE "userId" = ? AND "clientAttemptId" = ?`,
      args: [params.userId, clientAttemptId],
    });

    if (existingCheck.rows.length > 0) {
      const existing = rowAs<ExistingAttemptRow>(existingCheck.rows[0]);
      const value = await replayExistingAttempt(existing, requestHash, (run) => run(tx));
      return { replayed: true, value, enrichmentLeaseId: null };
    }

    // Read current profile inside write transaction
    const profileRows = await tx.execute({
      sql: `SELECT "listeningMastery", "vocabularyMastery", "spellingMastery", "totalStudyMinutes" FROM "LearnerProfile" WHERE "userId" = ?`,
      args: [params.userId],
    });
    const profile = profileRows.rows[0]
      ? rowAs<{
          listeningMastery: number;
          vocabularyMastery: number;
          spellingMastery: number;
          totalStudyMinutes: number;
        }>(profileRows.rows[0])
      : undefined;

    const oldListening = profile ? Number(profile.listeningMastery) : 0.5;
    const oldVocab = profile ? Number(profile.vocabularyMastery) : 0.5;
    const oldSpelling = profile ? Number(profile.spellingMastery) : 0.5;
    const scoreAsFraction = unitFraction(assessment.overallScore / 100, "overallScore/100");

    const newListening = updateMastery({
      oldMastery: oldListening,
      attemptScore: scoreAsFraction,
      hintCount: params.hintCount,
      replayCount: params.replayCount,
      difficulty: exercise.difficulty,
    });

    // Plan13 L1: spellingAccuracy / contentWordAccuracy are already 0..1.
    const newSpelling = updateMastery({
      oldMastery: oldSpelling,
      attemptScore: unitFraction(assessment.spellingAccuracy, "spellingAccuracy"),
      hintCount: params.hintCount,
      replayCount: params.replayCount,
    });

    const newVocab = updateMastery({
      oldMastery: oldVocab,
      attemptScore: unitFraction(assessment.contentWordAccuracy, "contentWordAccuracy"),
      hintCount: params.hintCount,
      replayCount: params.replayCount,
    });

    const enrichmentState = isOpenResponse ? "PENDING" : "NOT_REQUESTED";
    const enrichmentLeaseId = isOpenResponse ? randomUUID() : null;
    const enrichmentLeaseExpiresAt = isOpenResponse
      ? libSqlTimestamp(new Date(now.getTime() + ENRICHMENT_LEASE_MS))
      : null;

    // Plan13 L5 + receipt ids: resolve every flashcard id BEFORE the receipt is
    // serialized. An active card for (userId, vocabularyItemId) is reused; only
    // missing cards get a fresh id and an INSERT below.
    const flashcardIds: string[] = [];
    const flashcardPlans: Array<{ cardId: string; vocabularyItemId: string; origWord: string; insert: boolean }> = [];
    for (const lemma of uniqueWords) {
      const vocabularyItemId = vocabMap.get(lemma);
      if (!vocabularyItemId) continue;
      const origWord = errorWords.find((w) => w.toLocaleLowerCase("en") === lemma) ?? lemma;
      const existingCard = await tx.execute({
        sql: `SELECT "id" FROM "Flashcard" WHERE "userId" = ? AND "vocabularyItemId" = ? AND "active" = ?
              ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`,
        args: [params.userId, vocabularyItemId, libSqlBoolean(true)],
      });
      const reusedId = existingCard.rows[0] ? String(rowAs<{ id: string }>(existingCard.rows[0]).id) : null;
      const cardId = reusedId ?? randomUUID();
      flashcardIds.push(cardId);
      flashcardPlans.push({ cardId, vocabularyItemId, origWord, insert: reusedId === null });
    }

    const initialResultValue: SubmitAttemptResult = {
      attemptId,
      attempt: {
        id: attemptId,
        userId: params.userId,
        lessonId: params.lessonId,
        exerciseId: params.exerciseId,
        submittedAnswer: params.submittedAnswer,
        normalizedAnswer: assessment.normalizedActual,
        score: assessment.overallScore,
        completionTimeMs: params.completionTimeMs ?? null,
        replayCount: params.replayCount,
        hintCount: params.hintCount,
        playbackRate: params.playbackRate,
        clientAttemptId,
        requestHash,
        confidence,
        assistMode,
        createdAt: now,
      },
      assessment,
      aiFeedback: null,
      aiFeedbackStatus: isOpenResponse ? "unavailable" : "not_requested",
      flashcardIds,
    };

    let initialResultJson: string | null = null;
    if (!isOpenResponse) {
      const receipt: SerializedAttemptReceiptV1 = {
        version: "attempt-result-v1",
        result: initialResultValue,
      };
      initialResultJson = JSON.stringify(receipt);
    }

    // Statement 1: Attempt
    await tx.execute({
      sql: `INSERT INTO "Attempt" (
        "id", "userId", "lessonId", "exerciseId", "submittedAnswer", "normalizedAnswer",
        "score", "completionTimeMs", "replayCount", "hintCount", "playbackRate",
        "clientAttemptId", "requestHash", "resultJson", "enrichmentState",
        "enrichmentLeaseId", "enrichmentLeaseExpiresAt", "confidence", "assistMode", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        attemptId,
        params.userId,
        params.lessonId,
        params.exerciseId,
        params.submittedAnswer,
        assessment.normalizedActual,
        assessment.overallScore,
        params.completionTimeMs ?? null,
        params.replayCount,
        params.hintCount,
        params.playbackRate,
        clientAttemptId,
        requestHash,
        initialResultJson,
        enrichmentState,
        enrichmentLeaseId,
        enrichmentLeaseExpiresAt,
        confidence,
        assistMode,
        nowTs,
      ],
    });

    // Statement 2..N: Errors
    for (const error of assessment.errors) {
      await tx.execute({
        sql: `INSERT INTO "AttemptError" (
          "id", "attemptId", "errorType", "expectedText", "actualText",
          "position", "confidence", "metadata"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
        args: [
          randomUUID(),
          attemptId,
          error.type,
          error.expected,
          error.actual ?? null,
          error.position,
          error.confidence,
        ],
      });
    }

    // LearnerProfile upsert
    await tx.execute({
      sql: `INSERT INTO "LearnerProfile" (
        "id", "userId", "listeningMastery", "vocabularyMastery", "spellingMastery",
        "totalStudyMinutes", "currentStreak", "lastActivityAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
      ON CONFLICT("userId") DO UPDATE SET
        "listeningMastery" = excluded."listeningMastery",
        "vocabularyMastery" = excluded."vocabularyMastery",
        "spellingMastery" = excluded."spellingMastery",
        "totalStudyMinutes" = "LearnerProfile"."totalStudyMinutes" + 1,
        "lastActivityAt" = excluded."lastActivityAt",
        "updatedAt" = excluded."updatedAt"`,
      args: [
        randomUUID(),
        params.userId,
        newListening.newMastery,
        newVocab.newMastery,
        newSpelling.newMastery,
        nowTs,
        nowTs,
        nowTs,
      ],
    });

    // SkillMastery upserts
    const skillDeltas = [
      { key: SKILL_LISTENING, score: newListening.newMastery },
      { key: SKILL_VOCABULARY, score: newVocab.newMastery },
      { key: SKILL_SPELLING, score: newSpelling.newMastery },
      { key: SKILL_FUNCTION_WORDS, score: unitFraction(assessment.functionWordAccuracy, "functionWordAccuracy") },
    ];

    for (const skill of skillDeltas) {
      await tx.execute({
        sql: `INSERT INTO "SkillMastery" (
          "id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt"
        ) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT("userId", "skillKey") DO UPDATE SET
          "masteryScore" = excluded."masteryScore",
          "evidenceCount" = "SkillMastery"."evidenceCount" + 1,
          "lastUpdatedAt" = excluded."lastUpdatedAt"`,
        args: [randomUUID(), params.userId, skill.key, skill.score, nowTs],
      });
    }

    // Flashcards (only the missing ones) and VocabularyMastery for error words
    for (const plan of flashcardPlans) {
      if (plan.insert) {
        await tx.execute({
          sql: `INSERT INTO "Flashcard" (
            "id", "userId", "vocabularyItemId", "sourceAttemptId", "front", "back", "cardType", "active", "createdAt"
          ) VALUES (?, ?, ?, ?, ?, ?, 'TEXT_MEANING', ?, ?)`,
          args: [
            plan.cardId,
            params.userId,
            plan.vocabularyItemId,
            attemptId,
            plan.origWord,
            plan.origWord,
            libSqlBoolean(true),
            nowTs,
          ],
        });
      }

      await tx.execute({
        sql: `INSERT INTO "VocabularyMastery" (
          "id", "userId", "vocabularyItemId", "masteryScore", "correctCount", "incorrectCount",
          "lastReviewedAt", "nextReviewAt", "intervalDays", "easeFactor", "repetitionCount", "revision"
        ) VALUES (?, ?, ?, 0.3, 0, 1, ?, ?, 0.0, 2.5, 0, 1)
        ON CONFLICT("userId", "vocabularyItemId") DO UPDATE SET
          "masteryScore" = 0.3,
          "incorrectCount" = "VocabularyMastery"."incorrectCount" + 1,
          "lastReviewedAt" = excluded."lastReviewedAt",
          "revision" = "VocabularyMastery"."revision" + 1`,
        args: [randomUUID(), params.userId, plan.vocabularyItemId, nowTs, nowTs],
      });
    }

    return {
      replayed: false,
      value: initialResultValue,
      enrichmentLeaseId,
    };
  });
  } catch (error) {
    if (
      error instanceof IdempotencyConflictError
      || error instanceof OutcomePendingError
      || error instanceof LegacyResultUnavailableError
    ) {
      throw error;
    }

    const checkWinner = await prisma.attempt.findUnique({
      where: {
        userId_clientAttemptId: {
          userId: params.userId,
          clientAttemptId,
        },
      },
    });

    if (checkWinner) {
      const value = await replayExistingAttempt(
        checkWinner as ExistingAttemptRow,
        requestHash,
        (run) => withLibSqlWriteTransaction(run),
      );
      return { replayed: true, value };
    }

    throw error;
  }

  if (coreResult.replayed) {
    return { replayed: true, value: coreResult.value! };
  }

  if (!isOpenResponse) {
    logger.info(
      { attemptId, score: assessment.overallScore, errors: assessment.errors.length },
      "Attempt processed successfully"
    );
    return {
      replayed: false,
      value: coreResult.value!,
    };
  }

  const flashcardIds = coreResult.value.flashcardIds;

  // 7. Optional open-response AI enrichment
  let aiFeedback: AIFeedbackResponse | null = null;
  let aiFeedbackStatus:
    | "available"
    | "unavailable"
    | "rate_limited"
    | "not_requested" = "unavailable";
  let enrichmentState = "UNAVAILABLE";

  try {
    const aiProvider = createAIProviderFromEnv();
    const reservation = await reserveUserAICall({
      userId: params.userId,
      purpose: "error_analysis",
      provider: aiProvider.providerName,
      model: aiProvider.modelName,
    });
    try {
      aiFeedback = await aiProvider.analyzeErrors({
        transcript: exercise.lesson.transcript,
        submittedAnswer: params.submittedAnswer,
        wordDiffs: assessment.wordDiffs.map((d) => ({
          type: d.type,
          expected: d.expected,
          actual: d.actual,
        })),
        cefrLevel: exercise.lesson.cefrLevel,
        errorTypes: assessment.errors.map((e) => e.type),
        safetyIdentifier: params.userId,
      });
      await settleUserAICall(reservation, {
        success: true,
        provider: aiProvider.providerName,
        model: aiProvider.modelName,
      });
      aiFeedbackStatus = "available";
      enrichmentState = "AVAILABLE";
    } catch (error) {
      await settleUserAICall(reservation, {
        success: false,
        provider: aiProvider.providerName,
        model: aiProvider.modelName,
        failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
      });
      aiFeedbackStatus =
        isAIProviderError(error) &&
        (error.code === "AI_RATE_LIMITED" || error.code === "AI_REQUEST_LIMIT")
          ? "rate_limited"
          : "unavailable";
      enrichmentState = aiFeedbackStatus === "rate_limited" ? "RATE_LIMITED" : "UNAVAILABLE";
    }

    if (aiFeedbackStatus === "available" && aiFeedback) {
      await prisma.aIInteraction.create({
        data: {
          userId: params.userId,
          purpose: "error_analysis",
          provider: aiProvider.providerName,
          model: aiProvider.modelName,
          promptVersion: "responses-feedback-1.0",
          validatedOutput: JSON.stringify(aiFeedback),
          latencyMs: Date.now() - startTime,
          success: true,
        },
      });

      if (aiFeedback.errors.length > 0) {
        const savedErrors = await prisma.attemptError.findMany({
          where: { attemptId },
        });
        for (const feedback of aiFeedback.errors) {
          const matchingError = savedErrors.find(
            (error) =>
              error.expectedText === feedback.expected &&
              error.actualText === feedback.actual
          );
          if (matchingError) {
            await prisma.attemptError.update({
              where: { id: matchingError.id },
              data: {
                aiExplanation: feedback.explanationVi,
                remediationType: feedback.microExercise?.type ?? null,
              },
            });
          }
        }
      }
    }
  } catch (error) {
    aiFeedbackStatus =
      isAIProviderError(error) &&
      (error.code === "AI_RATE_LIMITED" || error.code === "AI_REQUEST_LIMIT")
        ? "rate_limited"
        : "unavailable";
    enrichmentState = aiFeedbackStatus === "rate_limited" ? "RATE_LIMITED" : "UNAVAILABLE";
    logger.warn(
      {
        code: isAIProviderError(error) ? error.code : "AI_UNAVAILABLE",
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "Live AI feedback unavailable; returning deterministic assessment without AI copy"
    );
  }

  const resultValue: SubmitAttemptResult = {
    attemptId,
    attempt: {
      id: attemptId,
      userId: params.userId,
      lessonId: params.lessonId,
      exerciseId: params.exerciseId,
      submittedAnswer: params.submittedAnswer,
      normalizedAnswer: assessment.normalizedActual,
      score: assessment.overallScore,
      completionTimeMs: params.completionTimeMs ?? null,
      replayCount: params.replayCount,
      hintCount: params.hintCount,
      playbackRate: params.playbackRate,
      clientAttemptId,
      requestHash,
      confidence,
      assistMode,
      createdAt: now,
    },
    assessment,
    aiFeedback,
    aiFeedbackStatus,
    flashcardIds,
  };

  const finalReceipt: SerializedAttemptReceiptV1 = {
    version: "attempt-result-v1",
    result: resultValue,
  };
  const finalResultJson = JSON.stringify(finalReceipt);

  // Atomically update Attempt with terminal enrichmentState and receipt. The
  // lease fence must match exactly one row (Plan13 D1); a zero-row update means
  // a replay already finalized this attempt after the lease expired.
  const finalizeRowsAffected = await withLibSqlWriteTransaction(async (tx) => {
    const update = await tx.execute({
      sql: `UPDATE "Attempt" SET
        "enrichmentState" = ?,
        "resultJson" = ?
        WHERE "id" = ? AND "userId" = ? AND "enrichmentLeaseId" = ? AND "enrichmentState" = 'PENDING'`,
      args: [
        enrichmentState,
        finalResultJson,
        attemptId,
        params.userId,
        coreResult.enrichmentLeaseId,
      ],
    });
    return Number(update.rowsAffected);
  });

  if (finalizeRowsAffected !== 1) {
    logger.error(
      { attemptId, clientAttemptId, rowsAffected: finalizeRowsAffected, enrichmentState },
      "Enrichment finalize did not update exactly one row; receipt not written"
    );
    throw new LegacyResultUnavailableError();
  }

  logger.info(
    { attemptId, score: assessment.overallScore, errors: assessment.errors.length },
    "Attempt processed successfully"
  );

  return {
    replayed: false,
    value: resultValue,
  };
}

export interface ReviewFlashcardParams {
  userId: string;
  flashcardId: string;
  rating: "AGAIN" | "HARD" | "GOOD" | "EASY";
  responseTimeMs?: number;
  clientReviewId?: string;
}

export type ReviewFlashcardResult = {
  reviewLogId: string;
  flashcardId: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitionCount: number;
};

export type SerializedReviewReceiptV1 = {
  version: "review-result-v1";
  result: ReviewFlashcardResult;
};

export async function reviewFlashcard(
  params: ReviewFlashcardParams
): Promise<IdempotentResult<ReviewFlashcardResult>> {
  const clientReviewId = params.clientReviewId ?? randomUUID();

  // 1. Owner-scoped flashcard check
  const flashcard = await prisma.flashcard.findUnique({
    where: { id: params.flashcardId },
  });

  if (!flashcard || flashcard.userId !== params.userId) {
    throw new Error("Flashcard not found");
  }

  // 2. Compute canonical request hash
  const canonicalPayload = {
    flashcardId: params.flashcardId,
    rating: params.rating,
    responseTimeMs: params.responseTimeMs ?? null,
  };
  const requestHash = hashCanonicalPayload(canonicalPayload);

  // 3. Fast check for existing review with same clientReviewId
  const existingReview = await prisma.reviewLog.findUnique({
    where: {
      userId_clientReviewId: {
        userId: params.userId,
        clientReviewId,
      },
    },
  });

  if (existingReview) {
    if (existingReview.requestHash !== requestHash) {
      throw new IdempotencyConflictError(
        "Client review ID already used with a different request payload"
      );
    }

    if (!existingReview.resultJson) {
      throw new LegacyResultUnavailableError();
    }

    const parsed = JSON.parse(existingReview.resultJson) as SerializedReviewReceiptV1;
    return {
      replayed: true,
      value: parsed.result,
    };
  }

  try {
    return await withLibSqlWriteTransaction(async (tx) => {
    // Re-check existing in tx in case of concurrent insert race
    const existingCheck = await tx.execute({
      sql: `SELECT "id", "requestHash", "resultJson" FROM "ReviewLog" WHERE "userId" = ? AND "clientReviewId" = ?`,
      args: [params.userId, clientReviewId],
    });

    if (existingCheck.rows.length > 0) {
      const existing = rowAs<{
        id: string;
        requestHash: string | null;
        resultJson: string | null;
      }>(existingCheck.rows[0]);
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(
          "Client review ID already used with a different request payload"
        );
      }
      if (!existing.resultJson) {
        throw new LegacyResultUnavailableError();
      }
      const parsed = JSON.parse(existing.resultJson) as SerializedReviewReceiptV1;
      return {
        replayed: true,
        value: parsed.result,
      };
    }

    // Read current VocabularyMastery within transaction
    const masteryRows = await tx.execute({
      sql: `SELECT "id", "revision", "repetitionCount", "intervalDays", "easeFactor", "correctCount", "incorrectCount"
            FROM "VocabularyMastery"
            WHERE "userId" = ? AND "vocabularyItemId" = ?`,
      args: [params.userId, flashcard.vocabularyItemId],
    });

    const mastery = masteryRows.rows[0]
      ? rowAs<{
          id: string;
          revision: number;
          repetitionCount: number;
          intervalDays: number;
          easeFactor: number;
          correctCount: number;
          incorrectCount: number;
        }>(masteryRows.rows[0])
      : undefined;

    const currentRevision = mastery ? Number(mastery.revision) : 0;

    // Run SM-2
    const result = processReview({
      repetitionCount: mastery ? Number(mastery.repetitionCount) : 0,
      intervalDays: mastery ? Number(mastery.intervalDays) : 0,
      easeFactor: mastery ? Number(mastery.easeFactor) : 2.5,
      rating: params.rating,
    });

    const masteryScore =
      params.rating === "AGAIN"
        ? 0.2
        : params.rating === "HARD"
        ? 0.4
        : params.rating === "GOOD"
        ? 0.7
        : 0.9;

    const reviewLogId = randomUUID();
    const now = new Date();
    const nowTs = libSqlTimestamp(now);
    const nextReviewTs = libSqlTimestamp(result.nextReviewAt);

    const resultValue: ReviewFlashcardResult = {
      reviewLogId,
      flashcardId: params.flashcardId,
      nextReviewAt: result.nextReviewAt.toISOString(),
      intervalDays: result.intervalDays,
      easeFactor: result.easeFactor,
      repetitionCount: result.repetitionCount,
    };

    const receipt: SerializedReviewReceiptV1 = {
      version: "review-result-v1",
      result: resultValue,
    };
    const resultJson = JSON.stringify(receipt);

    // Insert ReviewLog with resultJson
    await tx.execute({
      sql: `INSERT INTO "ReviewLog" (
        "id", "flashcardId", "userId", "rating", "responseTimeMs",
        "previousInterval", "nextInterval", "clientReviewId", "requestHash", "resultJson", "reviewedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        reviewLogId,
        params.flashcardId,
        params.userId,
        params.rating,
        params.responseTimeMs ?? null,
        mastery ? Number(mastery.intervalDays) : 0,
        result.intervalDays,
        clientReviewId,
        requestHash,
        resultJson,
        nowTs,
      ],
    });

    if (mastery) {
      const updateResult = await tx.execute({
        sql: `UPDATE "VocabularyMastery" SET
          "masteryScore" = ?,
          "lastReviewedAt" = ?,
          "nextReviewAt" = ?,
          "intervalDays" = ?,
          "easeFactor" = ?,
          "repetitionCount" = ?,
          "correctCount" = "correctCount" + ?,
          "incorrectCount" = "incorrectCount" + ?,
          "revision" = "revision" + 1
          WHERE "userId" = ? AND "vocabularyItemId" = ? AND "revision" = ?`,
        args: [
          masteryScore,
          nowTs,
          nextReviewTs,
          result.intervalDays,
          result.easeFactor,
          result.repetitionCount,
          params.rating === "GOOD" || params.rating === "EASY" ? 1 : 0,
          params.rating === "AGAIN" || params.rating === "HARD" ? 1 : 0,
          params.userId,
          flashcard.vocabularyItemId,
          currentRevision,
        ],
      });

      if (Number(updateResult.rowsAffected) !== 1) {
        throw new OutcomePendingError(
          2,
          "Concurrent review updated schedule; reload latest flashcards and retry"
        );
      }
    } else {
      await tx.execute({
        sql: `INSERT INTO "VocabularyMastery" (
          "id", "userId", "vocabularyItemId", "masteryScore", "lastReviewedAt",
          "nextReviewAt", "intervalDays", "easeFactor", "repetitionCount",
          "correctCount", "incorrectCount", "revision"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        args: [
          randomUUID(),
          params.userId,
          flashcard.vocabularyItemId,
          masteryScore,
          nowTs,
          nextReviewTs,
          result.intervalDays,
          result.easeFactor,
          result.repetitionCount,
          params.rating === "GOOD" || params.rating === "EASY" ? 1 : 0,
          params.rating === "AGAIN" || params.rating === "HARD" ? 1 : 0,
        ],
      });
    }

    return {
      replayed: false,
      value: resultValue,
    };
  });
  } catch (error) {
    const checkWinner = await prisma.reviewLog.findUnique({
      where: {
        userId_clientReviewId: {
          userId: params.userId,
          clientReviewId,
        },
      },
    });

    if (checkWinner) {
      if (checkWinner.requestHash !== requestHash) {
        throw new IdempotencyConflictError(
          "Client review ID already used with a different request payload"
        );
      }
      if (checkWinner.resultJson) {
        const parsed = JSON.parse(checkWinner.resultJson) as SerializedReviewReceiptV1;
        return {
          replayed: true,
          value: parsed.result,
        };
      }
      throw new LegacyResultUnavailableError();
    }

    throw error;
  }
}
