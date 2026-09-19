import "server-only";

import { prisma } from "@/lib/prisma";
import {
  LESSON_JOURNEY_STEPS,
  deriveCompletedSteps,
  describeJourneyStep,
  summariseJourney,
  type JourneyStepInfo,
  type LessonJourneyStep,
} from "@/core/learning/lesson-journey";

/**
 * Plan22 SPEC-P221 — reading and recording a lesson's journey.
 *
 * Only LEARN is written here. Every other step is read back out of evidence the
 * server already stores, so there is no second copy of the truth to drift.
 */

export interface LessonJourneyStepView extends JourneyStepInfo {
  done: boolean;
}

export interface LessonJourneyView {
  lessonId: string;
  percent: number;
  nextStep: LessonJourneyStep | null;
  isComplete: boolean;
  steps: LessonJourneyStepView[];
}

export async function getLessonJourney(userId: string, lessonId: string): Promise<LessonJourneyView> {
  const [storedRows, exerciseCount, attempts, runs] = await Promise.all([
    prisma.lessonJourneyProgress.findMany({
      where: { userId, lessonId },
      select: { step: true },
    }),
    prisma.exercise.count({ where: { lessonId } }),
    // Every attempt, because the best score per exercise decides TEST and a
    // later worse attempt must not undo a pass the learner already earned.
    prisma.attempt.findMany({
      where: { userId, lessonId },
      select: { exerciseId: true, score: true },
    }),
    prisma.adaptiveGameRun.findMany({
      where: { userId, lessonId, status: "COMPLETED" },
      select: { mode: true },
    }),
  ]);

  const bestScoreByExercise = new Map<string, number>();
  for (const attempt of attempts) {
    const score = attempt.score ?? 0;
    const best = bestScoreByExercise.get(attempt.exerciseId);
    if (best === undefined || score > best) bestScoreByExercise.set(attempt.exerciseId, score);
  }

  const completed = deriveCompletedSteps({
    storedSteps: storedRows.map((row) => row.step),
    exerciseCount,
    bestScoreByExercise,
    completedRunModes: runs.map((run) => run.mode),
  });
  const summary = summariseJourney(completed);
  const done = new Set(summary.completed);

  return {
    lessonId,
    percent: summary.percent,
    nextStep: summary.nextStep,
    isComplete: summary.isComplete,
    steps: LESSON_JOURNEY_STEPS.map((step) => ({ ...describeJourneyStep(step), done: done.has(step) })),
  };
}

/**
 * Record that the learner has read this lesson's words.
 *
 * Idempotent: opening the word cards twice is not two achievements, and the
 * unique key on (userId, lessonId, step) is what enforces that rather than a
 * read-then-write race.
 */
export async function markLessonLearned(userId: string, lessonId: string): Promise<void> {
  await prisma.lessonJourneyProgress.upsert({
    where: { userId_lessonId_step: { userId, lessonId, step: "LEARN" } },
    create: { userId, lessonId, step: "LEARN" },
    update: {},
  });
}
