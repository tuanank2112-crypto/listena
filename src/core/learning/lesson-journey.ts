/**
 * Plan22 SPEC-P221 — the five steps of a lesson, in order.
 *
 * Taken from the reference vocabulary app, whose real insight is not any single
 * exercise but the fixed path: a learner opens a lesson and never has to decide
 * what to do next. Each step here is satisfied by a surface ListenAI already
 * grades on the server, so the journey records progress and never becomes a
 * second place where answers are marked.
 */

export const LESSON_JOURNEY_STEPS = ["LEARN", "PRACTICE", "PLAY", "LISTEN", "TEST"] as const;

export type LessonJourneyStep = (typeof LESSON_JOURNEY_STEPS)[number];

export interface JourneyStepInfo {
  step: LessonJourneyStep;
  /** 1-based position in the path, for the numbered badge. */
  order: number;
  labelVi: string;
  hintVi: string;
  /** What the button says when this is the step to do next. */
  ctaVi: string;
}

const STEP_INFO: Record<LessonJourneyStep, Omit<JourneyStepInfo, "step" | "order">> = {
  LEARN: {
    labelVi: "Học từ",
    hintVi: "Xem qua từng từ của bài: nghĩa, phát âm, ví dụ.",
    ctaVi: "Học từ mới",
  },
  PRACTICE: {
    labelVi: "Luyện tập",
    hintVi: "Làm bài tập của bài học; máy chủ chấm từng câu.",
    ctaVi: "Vào luyện tập",
  },
  PLAY: {
    labelVi: "Ghép từ",
    hintVi: "Ghép từ với nghĩa. Đúng liên tiếp thì được combo.",
    ctaVi: "Chơi ghép từ",
  },
  LISTEN: {
    labelVi: "Nghe và viết",
    hintVi: "Nghe rồi gõ lại từ, chọn tốc độ vừa sức.",
    ctaVi: "Luyện nghe",
  },
  TEST: {
    labelVi: "Kiểm tra",
    hintVi: "Làm đúng hết bài tập của bài để khép chặng.",
    ctaVi: "Làm kiểm tra",
  },
};

export function describeJourneyStep(step: LessonJourneyStep): JourneyStepInfo {
  return { step, order: LESSON_JOURNEY_STEPS.indexOf(step) + 1, ...STEP_INFO[step] };
}

export function isLessonJourneyStep(value: unknown): value is LessonJourneyStep {
  return typeof value === "string" && (LESSON_JOURNEY_STEPS as readonly string[]).includes(value);
}

export interface JourneySummary {
  /** Completed steps in path order, whatever order they were finished in. */
  completed: LessonJourneyStep[];
  percent: number;
  /** The first step not yet done, which is where "continue" goes. */
  nextStep: LessonJourneyStep | null;
  isComplete: boolean;
}

/**
 * Where the learner stands.
 *
 * `nextStep` is the first *incomplete* step in path order, not the one after
 * the last completed step: a learner who jumped ahead and finished PLAY is sent
 * back to the LEARN they skipped rather than forward past it. Unknown values
 * are ignored so a row written by a newer deploy cannot break an older page.
 */
export function summariseJourney(completedSteps: readonly string[]): JourneySummary {
  const done = new Set(completedSteps.filter(isLessonJourneyStep));
  const completed = LESSON_JOURNEY_STEPS.filter((step) => done.has(step));
  const nextStep = LESSON_JOURNEY_STEPS.find((step) => !done.has(step)) ?? null;
  return {
    completed,
    percent: Math.round((completed.length / LESSON_JOURNEY_STEPS.length) * 100),
    nextStep,
    isComplete: nextStep === null,
  };
}

/**
 * A lesson's exercises count as passed at this score.
 *
 * The reference app repeats its end-of-lesson test until 100%. ListenAI cannot
 * copy that number: it grades free text with partial credit, so a dictation
 * answer can be right in every way that matters and still not score 100. A gate
 * that can never close would make the journey lie about itself, so the bar is
 * high but reachable.
 */
export const LESSON_TEST_PASS_SCORE = 80;

export interface JourneyEvidence {
  /** Steps recorded in LessonJourneyProgress; only LEARN is stored there today. */
  storedSteps: readonly string[];
  /** How many exercises the lesson has. */
  exerciseCount: number;
  /** Best score per exercise id, from this learner's attempts on this lesson. */
  bestScoreByExercise: ReadonlyMap<string, number>;
  /** Modes of this learner's COMPLETED game runs scoped to this lesson. */
  completedRunModes: readonly string[];
}

/**
 * Work out which steps are done.
 *
 * Only LEARN is stored, because nothing else records "the learner read the
 * words". Every other step is *derived* from evidence the server already keeps:
 * an attempt on this lesson, a completed run belonging to it, exercises all
 * passed. Deriving rather than double-writing means the journey can never drift
 * from the evidence underneath it — there is no second copy to keep in sync.
 */
export function deriveCompletedSteps(evidence: JourneyEvidence): LessonJourneyStep[] {
  const stored = new Set(evidence.storedSteps.filter(isLessonJourneyStep));
  const runModes = new Set(evidence.completedRunModes);
  const done: LessonJourneyStep[] = [];

  if (stored.has("LEARN")) done.push("LEARN");
  if (evidence.bestScoreByExercise.size > 0) done.push("PRACTICE");
  if (runModes.has("MATCH")) done.push("PLAY");
  if (runModes.has("SPELL")) done.push("LISTEN");

  const everyExercisePassed = evidence.exerciseCount > 0
    && evidence.bestScoreByExercise.size >= evidence.exerciseCount
    && [...evidence.bestScoreByExercise.values()].every((score) => score >= LESSON_TEST_PASS_SCORE);
  if (everyExercisePassed) done.push("TEST");

  return done;
}
