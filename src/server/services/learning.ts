/**
 * Core learning service: submit attempt, analyze, update profile, create flashcards.
 * Hardened under Plan 10 P102 with atomic libSQL batch persistence and request idempotency.
 */

import { randomUUID } from "node:crypto";
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

export async function submitAttempt(
  params: SubmitAttemptParams
): Promise<IdempotentResult<SubmitAttemptResult>> {
  const startTime = Date.now();
  const clientAttemptId = params.clientAttemptId ?? randomUUID();

  logger.info(
    { userId: params.userId, exerciseId: params.exerciseId, clientAttemptId },
    "Submitting attempt"
  );

  // 1. Compute canonical request hash
  const canonicalPayload = {
    exerciseId: params.exerciseId,
    lessonId: params.lessonId,
    submittedAnswer: params.submittedAnswer.trim(),
    completionTimeMs: params.completionTimeMs ?? null,
    replayCount: params.replayCount,
    hintCount: params.hintCount,
    playbackRate: params.playbackRate,
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
    include: {
      errors: true,
      flashcards: true,
    },
  });

  if (existingAttempt) {
    if (existingAttempt.requestHash !== requestHash) {
      throw new IdempotencyConflictError(
        "Client attempt ID already used with a different request payload"
      );
    }

    if (existingAttempt.enrichmentState === "PENDING") {
      const expiresAt = existingAttempt.enrichmentLeaseExpiresAt
        ? new Date(existingAttempt.enrichmentLeaseExpiresAt).getTime()
        : 0;
      if (Date.now() < expiresAt) {
        throw new OutcomePendingError(
          30,
          "AI feedback enrichment pending; retry with the same client ID"
        );
      }
    }

    if (existingAttempt.resultJson) {
      try {
        const parsed = JSON.parse(existingAttempt.resultJson) as SerializedAttemptReceiptV1;
        if (parsed.result?.attempt?.createdAt) {
          parsed.result.attempt.createdAt = new Date(parsed.result.attempt.createdAt);
        }
        return {
          replayed: true,
          value: parsed.result,
        };
      } catch {
        // Fallback for corrupted json
      }
    }

    throw new LegacyResultUnavailableError();
  }

  // 3. Fresh attempt: Get exercise and lesson, validating published status
  const exercise = await prisma.exercise.findUnique({
    where: { id: params.exerciseId },
    include: { lesson: true },
  });

  if (!exercise || exercise.lesson.status !== "PUBLISHED") {
    throw new Error("Exercise not found");
  }
  if (exercise.lessonId !== params.lessonId) {
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

  // 5. Pre-resolve vocabulary items outside the batch
  const errorWords: string[] = [];
  for (const error of assessment.errors) {
    if (!error.expected && !error.actual) continue;
    const word = (error.expected || error.actual || "").trim();
    if (word.length >= 2) {
      errorWords.push(word);
    }
  }

  const uniqueWords = [...new Set(errorWords.map((w) => w.toLowerCase()))];
  const vocabMap = new Map<string, string>();
  for (const lemma of uniqueWords) {
    const origWord = errorWords.find((w) => w.toLowerCase() === lemma) ?? lemma;
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
  const flashcardIds: string[] = [];

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
      sql: `SELECT "id", "requestHash", "resultJson", "enrichmentState", "enrichmentLeaseExpiresAt" FROM "Attempt" WHERE "userId" = ? AND "clientAttemptId" = ?`,
      args: [params.userId, clientAttemptId],
    });

    if (existingCheck.rows.length > 0) {
      const existing = rowAs<{
        id: string;
        requestHash: string | null;
        resultJson: string | null;
        enrichmentState: string;
        enrichmentLeaseExpiresAt: string | number | null;
      }>(existingCheck.rows[0]);
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(
          "Client attempt ID already used with a different request payload"
        );
      }
      if (existing.enrichmentState === "PENDING") {
        const expiresAt = existing.enrichmentLeaseExpiresAt
          ? new Date(existing.enrichmentLeaseExpiresAt).getTime()
          : 0;
        if (Date.now() < expiresAt) {
          throw new OutcomePendingError(
            30,
            "AI feedback enrichment pending; retry with the same client ID"
          );
        }
      }
      if (existing.resultJson) {
        const parsed = JSON.parse(existing.resultJson) as SerializedAttemptReceiptV1;
        if (parsed.result?.attempt?.createdAt) {
          parsed.result.attempt.createdAt = new Date(parsed.result.attempt.createdAt);
        }
        return {
          replayed: true,
          value: parsed.result,
          enrichmentLeaseId: null,
        };
      }
      throw new LegacyResultUnavailableError();
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
    const scoreAsFraction = assessment.overallScore / 100;

    const newListening = updateMastery({
      oldMastery: oldListening,
      attemptScore: scoreAsFraction,
      hintCount: params.hintCount,
      replayCount: params.replayCount,
      difficulty: exercise.difficulty,
    });

    const newSpelling = updateMastery({
      oldMastery: oldSpelling,
      attemptScore: assessment.spellingAccuracy / 100,
      hintCount: params.hintCount,
      replayCount: params.replayCount,
    });

    const newVocab = updateMastery({
      oldMastery: oldVocab,
      attemptScore: assessment.contentWordAccuracy / 100,
      hintCount: params.hintCount,
      replayCount: params.replayCount,
    });

    const enrichmentState = isOpenResponse ? "PENDING" : "NOT_REQUESTED";
    const enrichmentLeaseId = isOpenResponse ? randomUUID() : null;
    const enrichmentLeaseExpiresAt = isOpenResponse
      ? libSqlTimestamp(new Date(now.getTime() + 30000))
      : null;

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
        "enrichmentLeaseId", "enrichmentLeaseExpiresAt", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      { key: SKILL_FUNCTION_WORDS, score: assessment.functionWordAccuracy },
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

    // Flashcards and VocabularyMastery for unique error words
    for (const lemma of uniqueWords) {
      const vocabularyItemId = vocabMap.get(lemma);
      if (!vocabularyItemId) continue;
      const cardId = randomUUID();
      flashcardIds.push(cardId);
      const origWord = errorWords.find((w) => w.toLowerCase() === lemma) ?? lemma;

      await tx.execute({
        sql: `INSERT INTO "Flashcard" (
          "id", "userId", "vocabularyItemId", "sourceAttemptId", "front", "back", "cardType", "active", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, 'TEXT_MEANING', ?, ?)`,
        args: [
          cardId,
          params.userId,
          vocabularyItemId,
          attemptId,
          origWord,
          origWord,
          libSqlBoolean(true),
          nowTs,
        ],
      });

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
        args: [randomUUID(), params.userId, vocabularyItemId, nowTs, nowTs],
      });
    }

    return {
      replayed: false,
      value: initialResultValue,
      enrichmentLeaseId,
    };
  });
  } catch (error) {
    const checkWinner = await prisma.attempt.findUnique({
      where: {
        userId_clientAttemptId: {
          userId: params.userId,
          clientAttemptId,
        },
      },
    });

    if (checkWinner) {
      if (checkWinner.requestHash !== requestHash) {
        throw new IdempotencyConflictError(
          "Client attempt ID already used with a different request payload"
        );
      }
      if (checkWinner.resultJson) {
        const parsed = JSON.parse(checkWinner.resultJson) as SerializedAttemptReceiptV1;
        if (parsed.result?.attempt?.createdAt) {
          parsed.result.attempt.createdAt = new Date(parsed.result.attempt.createdAt);
        }
        return {
          replayed: true,
          value: parsed.result,
        };
      }
      if (checkWinner.enrichmentState === "PENDING") {
        throw new OutcomePendingError(
          30,
          "AI feedback enrichment pending; retry with the same client ID"
        );
      }
      throw new LegacyResultUnavailableError();
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

  // Atomically update Attempt with terminal enrichmentState and receipt
  await withLibSqlWriteTransaction(async (tx) => {
    await tx.execute({
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
  });

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
