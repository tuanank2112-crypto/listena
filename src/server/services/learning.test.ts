import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutcomePendingError } from "@/lib/idempotency";
import type { Transaction } from "@libsql/client";

type MockTx = { execute: ReturnType<typeof vi.fn> };

const {
  findExercise,
  findAttempt,
  upsertVocabItem,
  findFlashcard,
  findReviewLog,
  assess,
  createProvider,
  getProfile,
  getVocabularyMastery,
  atomicBatch,
  writeTx,
  mockTx,
} = vi.hoisted(() => {
  const mockTx: MockTx = { execute: vi.fn() };
  return {
    findExercise: vi.fn(),
    findAttempt: vi.fn(),
    upsertVocabItem: vi.fn(),
    findFlashcard: vi.fn(),
    findReviewLog: vi.fn(),
    assess: vi.fn(),
    createProvider: vi.fn(),
    getProfile: vi.fn(),
    getVocabularyMastery: vi.fn(),
    atomicBatch: vi.fn(),
    writeTx: vi.fn(async <T>(cb: (tx: Transaction) => Promise<T>): Promise<T> => cb(mockTx as unknown as Transaction)),
    mockTx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    exercise: { findUnique: findExercise },
    attempt: { findUnique: findAttempt },
    vocabularyItem: { upsert: upsertVocabItem },
    flashcard: { findUnique: findFlashcard },
    reviewLog: { findUnique: findReviewLog },
  },
}));
vi.mock("@/core/assessment/engine", () => ({
  assessDictation: assess,
  assessOpenResponse: assess,
}));
vi.mock("@/server/repos/learner", () => ({
  learnerRepo: {
    getProfile,
    getVocabularyMastery,
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: atomicBatch,
  withLibSqlWriteTransaction: <T>(cb: (tx: Transaction) => Promise<T>) => writeTx(cb),
  rowAs: <T>(r: unknown): T => r as T,
  libSqlTimestamp: (d: Date) => d.toISOString(),
  libSqlBoolean: (b: boolean) => (b ? 1 : 0),
}));
vi.mock("@/server/ai/provider", () => ({ createAIProviderFromEnv: createProvider }));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

import { submitAttempt, reviewFlashcard } from "./learning";

describe("submitAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    writeTx.mockImplementation(async <T>(cb: (tx: Transaction) => Promise<T>) => cb(mockTx as unknown as Transaction));
    atomicBatch.mockResolvedValue([{ changes: 1 }]);
    findAttempt.mockResolvedValue(null);
  });

  it.each(["DRAFT", "REVIEWED"])("rejects %s before grading, writes or AI", async (status) => {
    findExercise.mockResolvedValue({ lessonId: "lesson", lesson: { status } });
    await expect(
      submitAttempt({
        userId: "learner",
        exerciseId: "exercise",
        lessonId: "lesson",
        submittedAnswer: "guess",
        replayCount: 0,
        hintCount: 0,
        playbackRate: 1,
        clientAttemptId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toThrow("Exercise not found");
    expect(assess).not.toHaveBeenCalled();
    expect(writeTx).not.toHaveBeenCalled();
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
    getProfile.mockResolvedValue(null);

    const result = await submitAttempt({
      userId: "learner",
      exerciseId: "exercise",
      lessonId: "lesson",
      submittedAnswer: "hello",
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1,
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
    });

    expect(createProvider).not.toHaveBeenCalled();
    expect(writeTx).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      replayed: false,
      value: {
        aiFeedback: null,
        aiFeedbackStatus: "not_requested",
      },
    });
  });

  it("returns prior result on exact replay without executing atomic batch", async () => {
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

    const expectedResult = {
      attemptId: "attempt-123",
      attempt: {
        id: "attempt-123",
        userId: "learner",
        lessonId: "lesson",
        exerciseId: "exercise",
        submittedAnswer: "hello",
        normalizedAnswer: "hello",
        score: 100,
        completionTimeMs: null,
        replayCount: 0,
        hintCount: 0,
        playbackRate: 1,
        clientAttemptId: "00000000-0000-4000-8000-000000000001",
        requestHash: "f15aff217ee03b608ef8e138af00534ef3444f7663c88932b1884a711a53ee47",
        createdAt: new Date(),
      },
      assessment: {
        overallScore: 100,
        normalizedActual: "hello",
        wordDiffs: [],
        errors: [],
        spellingAccuracy: 1,
        contentWordAccuracy: 1,
        functionWordAccuracy: 1,
      },
      aiFeedback: null,
      aiFeedbackStatus: "not_requested" as const,
      flashcardIds: [],
    };

    // Mock existing attempt with same requestHash and stored receipt
    findAttempt.mockResolvedValue({
      id: "attempt-123",
      score: 100,
      normalizedAnswer: "hello",
      requestHash: "f15aff217ee03b608ef8e138af00534ef3444f7663c88932b1884a711a53ee47",
      resultJson: JSON.stringify({ version: "attempt-result-v1", result: expectedResult }),
      errors: [],
      flashcards: [],
      createdAt: new Date(),
    });

    const res = await submitAttempt({
      userId: "learner",
      exerciseId: "exercise",
      lessonId: "lesson",
      submittedAnswer: "hello",
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1,
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
    });

    expect(res).toEqual({
      replayed: true,
      value: expectedResult,
    });
    expect(writeTx).not.toHaveBeenCalled();
  });
});

describe("reviewFlashcard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    writeTx.mockImplementation(async <T>(cb: (tx: Transaction) => Promise<T>) => cb(mockTx as unknown as Transaction));
    atomicBatch.mockResolvedValue([{ changes: 1 }, { changes: 1 }]);
    findReviewLog.mockResolvedValue(null);
  });

  it("throws Flashcard not found if foreign card or missing", async () => {
    findFlashcard.mockResolvedValue({ id: "card-1", userId: "other-user" });
    await expect(
      reviewFlashcard({
        userId: "learner",
        flashcardId: "card-1",
        rating: "GOOD",
        clientReviewId: "00000000-0000-4000-8000-000000000002",
      })
    ).rejects.toThrow("Flashcard not found");
  });

  it("executes atomic batch and updates revision on successful review", async () => {
    findFlashcard.mockResolvedValue({
      id: "card-1",
      userId: "learner",
      vocabularyItemId: "vocab-1",
    });
    mockTx.execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("SELECT \"id\", \"revision\"")) {
        return {
          rows: [
            { id: "m-1", revision: 0, repetitionCount: 1, intervalDays: 1, easeFactor: 2.5 },
          ],
          rowsAffected: 0,
        };
      }
      return { rows: [], rowsAffected: 1 };
    });

    const result = await reviewFlashcard({
      userId: "learner",
      flashcardId: "card-1",
      rating: "GOOD",
      clientReviewId: "00000000-0000-4000-8000-000000000002",
    });

    expect(writeTx).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
    expect(result.value.flashcardId).toBe("card-1");
  });

  it("throws OutcomePendingError if concurrent update changes revision (changes === 0)", async () => {
    findFlashcard.mockResolvedValue({
      id: "card-1",
      userId: "learner",
      vocabularyItemId: "vocab-1",
    });
    mockTx.execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("SELECT \"id\", \"revision\"")) {
        return {
          rows: [
            { id: "m-1", revision: 0, repetitionCount: 1, intervalDays: 1, easeFactor: 2.5 },
          ],
          rowsAffected: 0,
        };
      }
      if (sql.includes("UPDATE \"VocabularyMastery\"")) {
        return { rows: [], rowsAffected: 0 };
      }
      return { rows: [], rowsAffected: 1 };
    });

    await expect(
      reviewFlashcard({
        userId: "learner",
        flashcardId: "card-1",
        rating: "GOOD",
        clientReviewId: "00000000-0000-4000-8000-000000000002",
      })
    ).rejects.toThrow(OutcomePendingError);
  });
});
