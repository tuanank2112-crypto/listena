/**
 * Core learning service: submit attempt, analyze, update profile, create flashcards.
 */

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
import { attemptRepo } from "@/server/repos/attempt";
import { learnerRepo } from "@/server/repos/learner";
import { flashcardRepo } from "@/server/repos/flashcard";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { SKILL_LISTENING, SKILL_VOCABULARY, SKILL_SPELLING, SKILL_FUNCTION_WORDS } from "@/core/constants";

export interface SubmitAttemptParams {
  userId: string;
  exerciseId: string;
  lessonId: string;
  submittedAnswer: string;
  completionTimeMs?: number;
  replayCount: number;
  hintCount: number;
  playbackRate: number;
}

export async function submitAttempt(params: SubmitAttemptParams) {
  const startTime = Date.now();
  logger.info({ userId: params.userId, exerciseId: params.exerciseId }, "Submitting attempt");

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

  // 2. Run the appropriate assessment mode.
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

  // 3. Save attempt
  const attempt = await attemptRepo.create({
    userId: params.userId,
    lessonId: params.lessonId,
    exerciseId: params.exerciseId,
    submittedAnswer: params.submittedAnswer,
    normalizedAnswer: assessment.normalizedActual,
    score: assessment.overallScore,
    completionTimeMs: params.completionTimeMs,
    replayCount: params.replayCount,
    hintCount: params.hintCount,
    playbackRate: params.playbackRate,
  });

  // 4. Save errors
  for (const error of assessment.errors) {
    await attemptRepo.createError({
      attemptId: attempt.id,
      errorType: error.type,
      expectedText: error.expected,
      actualText: error.actual,
      position: error.position,
      confidence: error.confidence,
    });
  }

  // 5. Update learner profile (mastery scores)
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

  await learnerRepo.upsertProfile(params.userId, {
    listeningMastery: newListening.newMastery,
    vocabularyMastery: newVocab.newMastery,
    spellingMastery: newSpelling.newMastery,
    lastActivityAt: new Date(),
    totalStudyMinutes: (profile?.totalStudyMinutes ?? 0) + 1,
  });

  // Update skill masteries
  await learnerRepo.upsertSkillMastery(params.userId, SKILL_LISTENING, {
    masteryScore: newListening.newMastery,
  });
  await learnerRepo.upsertSkillMastery(params.userId, SKILL_VOCABULARY, {
    masteryScore: newVocab.newMastery,
  });
  await learnerRepo.upsertSkillMastery(params.userId, SKILL_SPELLING, {
    masteryScore: newSpelling.newMastery,
  });
  await learnerRepo.upsertSkillMastery(params.userId, SKILL_FUNCTION_WORDS, {
    masteryScore: assessment.functionWordAccuracy,
  });

  // 6. Closed dictation is already server-graded. Spend live AI capacity only
  // on an explicit open-response exercise, and never label the assessment as
  // generated AI feedback when that optional call is unavailable.
  let aiFeedback: AIFeedbackResponse | null = null;
  let aiFeedbackProvider: {
    providerName: string;
    modelName: string;
  } | null = null;
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
      aiFeedbackProvider = aiProvider;
      aiFeedbackStatus = "available";
    } catch (error) {
      aiFeedbackStatus =
        isAIProviderError(error)
        && (error.code === "AI_RATE_LIMITED" || error.code === "AI_REQUEST_LIMIT")
          ? "rate_limited"
          : "unavailable";
      logger.warn(
        {
          code: isAIProviderError(error) ? error.code : "AI_UNAVAILABLE",
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "Live AI feedback unavailable; returning deterministic assessment without AI copy",
      );
    }
  }

  // Provenance writes are deliberately outside the provider-failure handler:
  // a database fault must not be mislabeled as an unavailable AI response.
  if (aiFeedback && aiFeedbackProvider) {
    await prisma.aIInteraction.create({
      data: {
        userId: params.userId,
        purpose: "error_analysis",
        provider: aiFeedbackProvider.providerName,
        model: aiFeedbackProvider.modelName,
        promptVersion: "responses-feedback-1.0",
        validatedOutput: JSON.stringify(aiFeedback),
        latencyMs: Date.now() - startTime,
        success: true,
      },
    });

    if (aiFeedback.errors.length > 0) {
      const savedErrors = await prisma.attemptError.findMany({
        where: { attemptId: attempt.id },
      });
      for (const feedback of aiFeedback.errors) {
        const matchingError = savedErrors.find(
          (error) =>
            error.expectedText === feedback.expected &&
            error.actualText === feedback.actual,
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
  // 7. Create flashcards from errors
  const flashcards = [];
  for (const error of assessment.errors) {
    // Skip correct answers (no error)
    if (!error.expected && !error.actual) continue;
    const word = error.expected || error.actual || "";
    if (word.length < 2) continue;

    // Check if flashcard already exists for this word
    const existingItem = await prisma.vocabularyItem.findFirst({
      where: { lemma: word.toLowerCase() },
    });

    const vocabularyItemId = existingItem?.id ?? (
      await prisma.vocabularyItem.create({
        data: {
          lemma: word.toLowerCase(),
          displayText: word,
          meaningVi: word,
          meaningEn: word,
          cefrLevel: "A2",
        },
      })
    ).id;

    const card = await flashcardRepo.create({
      userId: params.userId,
      vocabularyItemId,
      sourceAttemptId: attempt.id,
      front: word,
      back: word,
      cardType: "TEXT_MEANING",
    });
    flashcards.push(card);

    // Create/update vocabulary mastery
    await learnerRepo.upsertVocabularyMastery(params.userId, vocabularyItemId, {
      masteryScore: 0.3,
      incorrectCount: 1,
    });
  }

  logger.info(
    { attemptId: attempt.id, score: assessment.overallScore, errors: assessment.errors.length },
    "Attempt processed successfully"
  );

  return {
    attempt,
    assessment,
    aiFeedback,
    aiFeedbackStatus,
    flashcards,
  };
}

export async function reviewFlashcard(params: {
  userId: string;
  flashcardId: string;
  rating: "AGAIN" | "HARD" | "GOOD" | "EASY";
  responseTimeMs?: number;
}) {
  const flashcard = await prisma.flashcard.findUnique({
    where: { id: params.flashcardId },
  });

  if (!flashcard) {
    throw new Error("Flashcard not found");
  }

  if (flashcard.userId !== params.userId) {
    throw new Error("Unauthorized");
  }

  // Get current mastery
  const mastery = await learnerRepo.getVocabularyMastery(
    params.userId,
    flashcard.vocabularyItemId
  );

  // Run SM-2
  const result = processReview({
    repetitionCount: mastery?.repetitionCount ?? 0,
    intervalDays: mastery?.intervalDays ?? 0,
    easeFactor: mastery?.easeFactor ?? 2.5,
    rating: params.rating,
  });

  // Save review log
  await flashcardRepo.createReviewLog({
    flashcardId: params.flashcardId,
    userId: params.userId,
    rating: params.rating,
    responseTimeMs: params.responseTimeMs,
    previousInterval: mastery?.intervalDays ?? 0,
    nextInterval: result.intervalDays,
  });

  // Update vocabulary mastery
  const masteryScore = params.rating === "AGAIN" ? 0.2 : params.rating === "HARD" ? 0.4 : params.rating === "GOOD" ? 0.7 : 0.9;

  await learnerRepo.upsertVocabularyMastery(params.userId, flashcard.vocabularyItemId, {
    masteryScore,
    lastReviewedAt: new Date(),
    nextReviewAt: result.nextReviewAt,
    intervalDays: result.intervalDays,
    easeFactor: result.easeFactor,
    repetitionCount: result.repetitionCount,
    correctCount: params.rating === "GOOD" || params.rating === "EASY" ? 1 : 0,
    incorrectCount: params.rating === "AGAIN" || params.rating === "HARD" ? 1 : 0,
  });

  return result;
}





