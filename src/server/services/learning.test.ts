import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findExercise,
  assess,
  createAttempt,
  createProvider,
  getProfile,
  upsertProfile,
  upsertSkillMastery,
  upsertVocabularyMastery,
} = vi.hoisted(() => ({
  findExercise: vi.fn(),
  assess: vi.fn(),
  createAttempt: vi.fn(),
  createProvider: vi.fn(),
  getProfile: vi.fn(),
  upsertProfile: vi.fn(),
  upsertSkillMastery: vi.fn(),
  upsertVocabularyMastery: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { exercise: { findUnique: findExercise } } }));
vi.mock("@/core/assessment/engine", () => ({ assessDictation: assess, assessOpenResponse: assess }));
vi.mock("@/server/repos/attempt", () => ({ attemptRepo: { create: createAttempt } }));
vi.mock("@/server/repos/learner", () => ({
  learnerRepo: {
    getProfile,
    upsertProfile,
    upsertSkillMastery,
    upsertVocabularyMastery,
  },
}));
vi.mock("@/server/ai/provider", () => ({ createAIProviderFromEnv: createProvider }));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
import { submitAttempt } from "./learning";

describe("attempt lesson availability", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["DRAFT", "REVIEWED"])("rejects %s before grading, writes or AI", async (status) => {
    findExercise.mockResolvedValue({ lessonId: "lesson", lesson: { status } });
    await expect(submitAttempt({
      userId: "learner", exerciseId: "exercise", lessonId: "lesson",
      submittedAnswer: "guess", replayCount: 0, hintCount: 0, playbackRate: 1,
    })).rejects.toThrow("Exercise not found");
    expect(assess).not.toHaveBeenCalled();
    expect(createAttempt).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("uses server assessment without spending AI capacity for a closed dictation", async () => {
    findExercise.mockResolvedValue({
      lessonId: "lesson",
      correctAnswer: "hello",
      difficulty: 1,
      metadata: "{}",
      lesson: { status: "PUBLISHED", transcript: "Hello", cefrLevel: "A2" },
    });
    assess.mockReturnValue({
      normalizedActual: "hello",
      overallScore: 100,
      errors: [],
      wordDiffs: [],
      spellingAccuracy: 1,
      contentWordAccuracy: 1,
      functionWordAccuracy: 1,
    });
    createAttempt.mockResolvedValue({ id: "attempt" });
    getProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue({});
    upsertSkillMastery.mockResolvedValue({});

    const result = await submitAttempt({
      userId: "learner",
      exerciseId: "exercise",
      lessonId: "lesson",
      submittedAnswer: "hello",
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1,
    });

    expect(createProvider).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      aiFeedback: null,
      aiFeedbackStatus: "not_requested",
    });
  });
});
