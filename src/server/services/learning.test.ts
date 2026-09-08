import { beforeEach, describe, expect, it, vi } from "vitest";

const { findExercise, assess, createAttempt, createProvider } = vi.hoisted(() => ({
  findExercise: vi.fn(), assess: vi.fn(), createAttempt: vi.fn(), createProvider: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { exercise: { findUnique: findExercise } } }));
vi.mock("@/core/assessment/engine", () => ({ assessDictation: assess, assessOpenResponse: assess }));
vi.mock("@/server/repos/attempt", () => ({ attemptRepo: { create: createAttempt } }));
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
});
