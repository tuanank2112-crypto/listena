/**
 * Core learning service: submit attempt, analyze, update profile, create flashcards.
 */

import { assessDictation, assessOpenResponse } from "@/core/assessment/engine";
import { updateMastery } from "@/core/learner-model/mastery";
import { processReview } from "@/core/srs/sm2";
import { createAIProvider, type AIFeedbackErrorType } from "@/server/ai/provider";
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

  if (!exercise) {
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

  // 6. Try AI feedback (mock or real)
  let aiFeedback = null;
  try {
    const aiProvider = createAIProvider({
      provider: (process.env.AI_PROVIDER as "mock" | "openai") ?? "mock",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });

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
    });

    // Log AI interaction
    await prisma.aIInteraction.create({
      data: {
        userId: params.userId,
        purpose: "error_analysis",
        model: process.env.OPENAI_MODEL ?? "mock",
        promptVersion: "1.0",
        validatedOutput: JSON.stringify(aiFeedback),
        latencyMs: Date.now() - startTime,
        success: true,
      },
    });

    // Update attempt errors with AI explanations
    if (aiFeedback.errors.length > 0) {
      const savedErrors = await prisma.attemptError.findMany({
        where: { attemptId: attempt.id },
      });
      for (const fb of aiFeedback.errors) {
        const matchingError = savedErrors.find(
          (e) => e.expectedText === fb.expected && e.actualText === fb.actual
        );
        if (matchingError) {
          await prisma.attemptError.update({
            where: { id: matchingError.id },
            data: {
              aiExplanation: fb.explanationVi,
              remediationType: fb.microExercise?.type ?? null,
            },
          });
        }
      }
    }
  } catch (error) {
    logger.warn({ error }, "AI feedback generation failed, using deterministic fallback");
    // Deterministic fallback feedback
    aiFeedback = {
      summaryVi: `Bạn đạt ${assessment.overallScore} điểm. ${assessment.errors.length} lỗi được phát hiện.`,
      errors: assessment.errors.map((e) => ({
        errorType: e.type as AIFeedbackErrorType,
        expected: e.expected,
        actual: e.actual,
        probableCauseVi: "Lỗi trong quá trình nghe chép chính tả.",
        explanationVi: `Từ "${e.expected}" có thể bạn chưa nghe rõ hoặc chưa quen cách viết.`,
        microExercise: {
          type: "FLASHCARD" as const,
          instructionVi: "Ôn lại từ này với flashcard.",
          items: [e.expected],
        },
        confidence: e.confidence,
      })),
      recommendedActions: ["Luyện nghe lại bài này", "Ôn tập từ vựng"],
    };
  }

  if (isOpenResponse) {
    aiFeedback = {
      summaryVi: `Bài tự luận đã được ghi nhận với ${assessment.overallScore} điểm hoàn thành.`,
      errors: [],
      recommendedActions: [
        "Đọc lại câu trả lời và kiểm tra thì",
        "Bổ sung từ vựng đúng chủ đề",
        "Hỏi Gia sư AI để nhận góp ý chi tiết",
      ],
    };
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





