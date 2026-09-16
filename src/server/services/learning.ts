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
import { learnerRepo } from "@/server/repos/learner";
import { prisma } from "@/lib/prisma";
import {
  executeAtomicLibSqlBatch,
  libSqlTimestamp,
  libSqlBoolean,
  type LibSqlBatchStatement,
} from "@/lib/libsql-batch";
import {
  hashCanonicalPayload,
  type IdempotentResult,
  IdempotencyConflictError,
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

export async function submitAttempt(
  params: SubmitAttemptParams
): Promise<IdempotentResult<SubmitAttemptResult>> {
  const startTime = Date.now();
  const clientAttemptId = params.clientAttemptId ?? randomUUID();

  logger.info(
    { userId: params.userId, exerciseId: params.exerciseId, clientAttemptId },
    "Submitting attempt"
  );

  // 1. Get exercise and lesson
  const exercise = await prisma.exercise.findUnique({
    where: { id: params.exerciseId },
    include: { lesson: true },
  });

  if (!exercise || exercise.lesson.status !== "PUBLISHED") {
    throw new Error("Exercise not found");
  }
  if (exercise.lessonId !== params.lessonId) {
    throw new Error("Exercise does not belong to the lesson");
  }

  // 2. Compute canonical request hash
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

  // 3. Check for existing attempt with same clientAttemptId
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

    return {
      replayed: true,
      value: {
        attemptId: existingAttempt.id,
        attempt: existingAttempt,
        assessment: {
          overallScore: existingAttempt.score ?? 0,
          normalizedActual: existingAttempt.normalizedAnswer ?? "",
          wordDiffs: [],
          errors: existingAttempt.errors.map((e) => ({
            type: e.errorType,
            expected: e.expectedText,
            actual: e.actualText,
            position: e.position,
            confidence: e.confidence,
          })),
          spellingAccuracy: 1,
          contentWordAccuracy: 1,
          functionWordAccuracy: 1,
        },
        aiFeedback: null,
        aiFeedbackStatus: "not_requested",
        flashcardIds: existingAttempt.flashcards.map((f) => f.id),
      },
    };
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

  // 6. Calculate mastery deltas
  const profile = await learnerRepo.getProfile(params.userId);
  const oldListening = profile?.listeningMastery ?? 0.5;
  const oldVocab = profile?.vocabularyMastery ?? 0.5;
  const oldSpelling = profile?.spellingMastery ?? 0.5;
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
    attemptScore: assessment.spellingAccuracy,
    hintCount: params.hintCount,
    replayCount: params.replayCount,
  });

  const newVocab = updateMastery({
    oldMastery: oldVocab,
    attemptScore: assessment.contentWordAccuracy,
    hintCount: params.hintCount,
    replayCount: params.replayCount,
  });

  // 7. Assemble atomic statements
  const attemptId = randomUUID();
  const now = new Date();
  const nowTs = libSqlTimestamp(now);

  const statements: LibSqlBatchStatement[] = [];

  // Statement 1: Attempt
  statements.push({
    sql: `INSERT INTO "Attempt" (
      "id", "userId", "lessonId", "exerciseId", "submittedAnswer", "normalizedAnswer",
      "score", "completionTimeMs", "replayCount", "hintCount", "playbackRate",
      "clientAttemptId", "requestHash", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
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
      nowTs,
    ],
  });

  // Statement 2..N: Errors
  for (const error of assessment.errors) {
    statements.push({
      sql: `INSERT INTO "AttemptError" (
        "id", "attemptId", "errorType", "expectedText", "actualText",
        "position", "confidence", "metadata"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
      values: [
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

  // LearnerProfile upsert: delta-safe increment on totalStudyMinutes
  statements.push({
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
    values: [
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

  // 4 SkillMastery upserts
  const skillDeltas: Array<{ key: string; score: number }> = [
    { key: SKILL_LISTENING, score: newListening.newMastery },
    { key: SKILL_VOCABULARY, score: newVocab.newMastery },
    { key: SKILL_SPELLING, score: newSpelling.newMastery },
    { key: SKILL_FUNCTION_WORDS, score: assessment.functionWordAccuracy },
  ];

  for (const skill of skillDeltas) {
    statements.push({
      sql: `INSERT INTO "SkillMastery" (
        "id", "userId", "skillKey", "masteryScore", "evidenceCount", "lastUpdatedAt"
      ) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT("userId", "skillKey") DO UPDATE SET
        "masteryScore" = excluded."masteryScore",
        "evidenceCount" = "SkillMastery"."evidenceCount" + 1,
        "lastUpdatedAt" = excluded."lastUpdatedAt"`,
      values: [randomUUID(), params.userId, skill.key, skill.score, nowTs],
    });
  }

  // Flashcards and VocabularyMastery for unique error words
  const flashcardIds: string[] = [];
  for (const lemma of uniqueWords) {
    const vocabularyItemId = vocabMap.get(lemma);
    if (!vocabularyItemId) continue;
    const cardId = randomUUID();
    flashcardIds.push(cardId);
    const origWord = errorWords.find((w) => w.toLowerCase() === lemma) ?? lemma;

    statements.push({
      sql: `INSERT INTO "Flashcard" (
        "id", "userId", "vocabularyItemId", "sourceAttemptId", "front", "back", "cardType", "active", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, 'TEXT_MEANING', ?, ?)`,
      values: [
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

    statements.push({
      sql: `INSERT INTO "VocabularyMastery" (
        "id", "userId", "vocabularyItemId", "masteryScore", "correctCount", "incorrectCount",
        "lastReviewedAt", "nextReviewAt", "intervalDays", "easeFactor", "repetitionCount", "revision"
      ) VALUES (?, ?, ?, 0.3, 0, 1, ?, ?, 0.0, 2.5, 0, 0)
      ON CONFLICT("userId", "vocabularyItemId") DO UPDATE SET
        "masteryScore" = 0.3,
        "incorrectCount" = "VocabularyMastery"."incorrectCount" + 1,
        "lastReviewedAt" = excluded."lastReviewedAt"`,
      values: [randomUUID(), params.userId, vocabularyItemId, nowTs, nowTs],
    });
  }

  // Execute core commit atomically
  await executeAtomicLibSqlBatch(statements);

  // 8. Optional open-response AI enrichment
  let aiFeedback: AIFeedbackResponse | null = null;
  let aiFeedbackStatus:
    | "available"
    | "unavailable"
    | "rate_limited"
    | "not_requested" = "not_requested";

  if (isOpenResponse) {
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
      } catch (error) {
        await settleUserAICall(reservation, {
          success: false,
          provider: aiProvider.providerName,
          model: aiProvider.modelName,
          failureReason: isAIProviderError(error) ? error.details.reason : "unknown",
        });
        throw error;
      }
      await settleUserAICall(reservation, {
        success: true,
        provider: aiProvider.providerName,
        model: aiProvider.modelName,
      });

      aiFeedbackStatus = "available";

      // Save enrichment trace and update errors
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
    } catch (error) {
      aiFeedbackStatus =
        isAIProviderError(error) &&
        (error.code === "AI_RATE_LIMITED" || error.code === "AI_REQUEST_LIMIT")
          ? "rate_limited"
          : "unavailable";
      logger.warn(
        {
          code: isAIProviderError(error) ? error.code : "AI_UNAVAILABLE",
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "Live AI feedback unavailable; returning deterministic assessment without AI copy"
      );
    }
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

  // 3. Check for existing review with same clientReviewId
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

    return {
      replayed: true,
      value: {
        reviewLogId: existingReview.id,
        flashcardId: existingReview.flashcardId,
        nextReviewAt: existingReview.reviewedAt.toISOString(),
        intervalDays: existingReview.nextInterval,
        easeFactor: 2.5,
        repetitionCount: 1,
      },
    };
  }

  // 4. Get current mastery snapshot
  const mastery = await learnerRepo.getVocabularyMastery(
    params.userId,
    flashcard.vocabularyItemId
  );
  const currentRevision = mastery?.revision ?? 0;

  // 5. Run SM-2
  const result = processReview({
    repetitionCount: mastery?.repetitionCount ?? 0,
    intervalDays: mastery?.intervalDays ?? 0,
    easeFactor: mastery?.easeFactor ?? 2.5,
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

  // 6. Build atomic batch
  const statements: LibSqlBatchStatement[] = [
    {
      sql: `INSERT INTO "ReviewLog" (
        "id", "flashcardId", "userId", "rating", "responseTimeMs",
        "previousInterval", "nextInterval", "clientReviewId", "requestHash", "reviewedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        reviewLogId,
        params.flashcardId,
        params.userId,
        params.rating,
        params.responseTimeMs ?? null,
        mastery?.intervalDays ?? 0,
        result.intervalDays,
        clientReviewId,
        requestHash,
        nowTs,
      ],
    },
  ];

  if (mastery) {
    statements.push({
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
      values: [
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
  } else {
    statements.push({
      sql: `INSERT INTO "VocabularyMastery" (
        "id", "userId", "vocabularyItemId", "masteryScore", "lastReviewedAt",
        "nextReviewAt", "intervalDays", "easeFactor", "repetitionCount",
        "correctCount", "incorrectCount", "revision"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      values: [
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

  const batchResults = await executeAtomicLibSqlBatch(statements);

  // If mastery existed and revision changed concurrently, exactly 0 rows updated
  if (mastery && batchResults[1]?.changes === 0) {
    throw new OutcomePendingError(
      2,
      "Concurrent review updated schedule; reload latest flashcards and retry"
    );
  }

  return {
    replayed: false,
    value: {
      reviewLogId,
      flashcardId: params.flashcardId,
      nextReviewAt: result.nextReviewAt.toISOString(),
      intervalDays: result.intervalDays,
      easeFactor: result.easeFactor,
      repetitionCount: result.repetitionCount,
    },
  };
}
