import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashCanonicalPayload, LegacyResultUnavailableError, OutcomePendingError } from "@/lib/idempotency";
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
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

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

describe("submitAttempt — Plan13 P132 learning correctness", () => {
  const baseParams = {
    userId: "learner",
    exerciseId: "exercise",
    lessonId: "lesson",
    submittedAnswer: "welcome to the airport",
    replayCount: 0,
    hintCount: 0,
    playbackRate: 1,
    clientAttemptId: "00000000-0000-4000-8000-000000000001",
  };
  const publishedExercise = {
    lessonId: "lesson",
    correctAnswer: "welcome to the airport",
    difficulty: 1,
    metadata: "{}",
    lesson: { status: "PUBLISHED", transcript: "Welcome", cefrLevel: "A2" },
  };
  const perfectAssessment = {
    normalizedActual: "welcome to the airport",
    overallScore: 100,
    errors: [],
    wordDiffs: [],
    spellingAccuracy: 1,
    contentWordAccuracy: 1,
    functionWordAccuracy: 1,
  };

  function profileAwareTx(overrides: (sql: string) => unknown = () => undefined) {
    mockTx.execute.mockImplementation(async ({ sql }: { sql: string }) => {
      const override = overrides(sql);
      if (override !== undefined) return override;
      if (sql.includes('SELECT "listeningMastery"')) {
        return {
          rows: [{ listeningMastery: 0.5, vocabularyMastery: 0.5, spellingMastery: 0.5, totalStudyMinutes: 1 }],
          rowsAffected: 0,
        };
      }
      return { rows: [], rowsAffected: 1 };
    });
  }

  function statementCalls(fragment: string) {
    return mockTx.execute.mock.calls.filter(([stmt]) => String((stmt as { sql: string }).sql).includes(fragment));
  }

  function statementArgs(fragment: string, index = 0): unknown[] {
    return (statementCalls(fragment)[index]?.[0] as { args: unknown[] }).args;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    findAttempt.mockResolvedValue(null);
    upsertVocabItem.mockResolvedValue({ id: "vocab-1" });
    writeTx.mockImplementation(async <T>(cb: (tx: Transaction) => Promise<T>) => cb(mockTx as unknown as Transaction));
    profileAwareTx();
  });

  it("L1: a 100% correct dictation RAISES spelling and vocabulary mastery (accuracies are 0..1, not /100)", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue(perfectAssessment);

    await submitAttempt(baseParams);

    const [, , listening, vocabulary, spelling] = statementArgs('INSERT INTO "LearnerProfile"') as number[];
    expect(listening).toBeGreaterThan(0.5);
    expect(vocabulary).toBeGreaterThan(0.5);
    expect(spelling).toBeGreaterThan(0.5);
    // 0.5 * MASTERY_OLD_WEIGHT(0.8) + 1 * MASTERY_NEW_WEIGHT(0.2); with the old /100 this was 0.402
    expect(spelling).toBeCloseTo(0.6, 5);
  });

  it("L1: a fully wrong dictation LOWERS spelling and vocabulary mastery", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue({
      ...perfectAssessment,
      overallScore: 0,
      spellingAccuracy: 0,
      contentWordAccuracy: 0,
      functionWordAccuracy: 0,
    });

    await submitAttempt(baseParams);

    const [, , , vocabulary, spelling] = statementArgs('INSERT INTO "LearnerProfile"') as number[];
    expect(vocabulary).toBeLessThan(0.5);
    expect(spelling).toBeLessThan(0.5);
  });

  it("L4: rejects an exercise that belongs to another lesson before grading or writing", async () => {
    findExercise.mockResolvedValue({ ...publishedExercise, lessonId: "another-lesson" });

    await expect(submitAttempt(baseParams)).rejects.toThrow("Exercise does not belong to the lesson");
    expect(assess).not.toHaveBeenCalled();
    expect(writeTx).not.toHaveBeenCalled();
    expect(upsertVocabItem).not.toHaveBeenCalled();
  });

  it("creates vocabulary only from expected words that look like lemmas, never from EXTRA_WORD", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue({
      ...perfectAssessment,
      overallScore: 60,
      errors: [
        { type: "EXTRA_WORD", expected: "", actual: "blorp", position: 4, confidence: 0.9 },
        { type: "MISSING_WORD", expected: "passport", actual: null, position: 3, confidence: 0.95 },
        { type: "SPELLING", expected: "a", actual: "ah", position: 1, confidence: 0.85 },
        { type: "VOCABULARY", expected: "gate12", actual: "gate", position: 2, confidence: 0.7 },
        { type: "SPELLING", expected: "Don't", actual: "dont", position: 0, confidence: 0.85 },
      ],
    });

    await submitAttempt(baseParams);

    const lemmas = upsertVocabItem.mock.calls.map(([call]) => (call as { where: { lemma: string } }).where.lemma);
    expect(lemmas).toEqual(["passport", "don't"]);
    expect(lemmas).not.toContain("blorp");
  });

  it("L5 + receipt ids: reuses the learner's active flashcard for the word and stores its id in the receipt", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue({
      ...perfectAssessment,
      overallScore: 60,
      errors: [{ type: "MISSING_WORD", expected: "passport", actual: null, position: 3, confidence: 0.95 }],
    });
    profileAwareTx((sql) => (sql.includes('SELECT "id" FROM "Flashcard"') ? { rows: [{ id: "fc-existing" }], rowsAffected: 0 } : undefined));

    const result = await submitAttempt(baseParams);

    expect(result.value.flashcardIds).toEqual(["fc-existing"]);
    expect(statementCalls('INSERT INTO "Flashcard"')).toHaveLength(0);
    const resultJson = statementArgs('INSERT INTO "Attempt"')[13] as string;
    expect(JSON.parse(resultJson).result.flashcardIds).toEqual(["fc-existing"]);
  });

  it("receipt ids: a freshly created flashcard id is present in the stored receipt (built before stringify)", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue({
      ...perfectAssessment,
      overallScore: 60,
      errors: [{ type: "MISSING_WORD", expected: "passport", actual: null, position: 3, confidence: 0.95 }],
    });

    const result = await submitAttempt(baseParams);

    expect(result.value.flashcardIds).toHaveLength(1);
    expect(statementArgs('INSERT INTO "Flashcard"')[0]).toBe(result.value.flashcardIds[0]);
    const resultJson = statementArgs('INSERT INTO "Attempt"')[13] as string;
    expect(JSON.parse(resultJson).result.flashcardIds).toEqual(result.value.flashcardIds);
  });

  it("persists confidence and assistMode (Answer Canvas) into the Attempt row and receipt", async () => {
    findExercise.mockResolvedValue(publishedExercise);
    assess.mockReturnValue(perfectAssessment);

    const result = await submitAttempt({ ...baseParams, confidence: 2, assistMode: "TILES" });

    const args = statementArgs('INSERT INTO "Attempt"');
    expect(args[17]).toBe(2);
    expect(args[18]).toBe("TILES");
    expect(result.value.attempt).toMatchObject({ confidence: 2, assistMode: "TILES" });

    await submitAttempt(baseParams);
    expect(statementArgs('INSERT INTO "Attempt"', 1).slice(17, 19)).toEqual([null, null]);
  });

  describe("L6/D1: stale PENDING enrichment", () => {
    const staleRow = () => ({
      id: "attempt-stale",
      userId: "learner",
      lessonId: "lesson",
      exerciseId: "exercise",
      submittedAnswer: "welcome to the airport",
      normalizedAnswer: "welcome to the airport",
      score: 60,
      completionTimeMs: null,
      replayCount: 0,
      hintCount: 0,
      playbackRate: 1,
      clientAttemptId: baseParams.clientAttemptId,
      requestHash: hashCanonicalPayload({
        exerciseId: "exercise",
        lessonId: "lesson",
        submittedAnswer: "welcome to the airport",
        completionTimeMs: null,
        replayCount: 0,
        hintCount: 0,
        playbackRate: 1,
      }),
      resultJson: null,
      enrichmentState: "PENDING",
      enrichmentLeaseId: "lease-1",
      enrichmentLeaseExpiresAt: new Date(Date.now() - 1_000),
      confidence: null,
      assistMode: null,
      createdAt: new Date("2026-09-17T10:00:00.000Z"),
    });

    it("finalizes deterministically from the stored score/errors as SKIPPED and replays 200", async () => {
      findAttempt.mockResolvedValue(staleRow());
      profileAwareTx((sql) => {
        if (sql.includes('FROM "AttemptError"')) {
          return { rows: [{ errorType: "MISSING_WORD", expectedText: "passport", actualText: null, position: 3, confidence: 0.95 }], rowsAffected: 0 };
        }
        if (sql.includes('FROM "Flashcard"')) return { rows: [{ id: "fc-1" }], rowsAffected: 0 };
        return undefined;
      });

      const result = await submitAttempt(baseParams);

      expect(result.replayed).toBe(true);
      expect(result.value).toMatchObject({
        attemptId: "attempt-stale",
        aiFeedback: null,
        aiFeedbackStatus: "unavailable",
        flashcardIds: ["fc-1"],
        assessment: {
          overallScore: 60,
          errors: [{ type: "MISSING_WORD", expected: "passport", actual: null, position: 3, confidence: 0.95 }],
          spellingAccuracy: 0.6,
        },
      });
      const update = statementCalls('UPDATE "Attempt"')[0]?.[0] as { sql: string; args: unknown[] };
      expect(update.sql).toContain("'SKIPPED'");
      expect(update.sql).toContain("\"enrichmentState\" = 'PENDING'");
      expect(update.args).toEqual([expect.any(String), "attempt-stale", "learner", "lease-1"]);
      expect(findExercise).not.toHaveBeenCalled();
    });

    it("throws LegacyResultUnavailableError when the fenced finalize does not affect exactly one row", async () => {
      findAttempt.mockResolvedValue(staleRow());
      profileAwareTx((sql) => {
        if (sql.includes('UPDATE "Attempt"')) return { rows: [], rowsAffected: 0 };
        if (sql.includes('SELECT "resultJson"')) return { rows: [{ resultJson: null }], rowsAffected: 0 };
        return undefined;
      });

      await expect(submitAttempt(baseParams)).rejects.toThrow(LegacyResultUnavailableError);
    });

    it("keeps returning OUTCOME_PENDING while the lease is still live", async () => {
      findAttempt.mockResolvedValue({ ...staleRow(), enrichmentLeaseExpiresAt: new Date(Date.now() + 60_000) });

      await expect(submitAttempt(baseParams)).rejects.toThrow(OutcomePendingError);
      expect(writeTx).not.toHaveBeenCalled();
    });
  });

  it("D1: the live enrichment finalize must update exactly one row or the outcome is reported unavailable", async () => {
    findExercise.mockResolvedValue({ ...publishedExercise, metadata: JSON.stringify({ answerMode: "open" }) });
    assess.mockReturnValue(perfectAssessment);
    createProvider.mockImplementation(() => {
      throw new Error("provider not configured");
    });
    profileAwareTx((sql) => (sql.includes('UPDATE "Attempt"') ? { rows: [], rowsAffected: 0 } : undefined));

    await expect(submitAttempt(baseParams)).rejects.toThrow(LegacyResultUnavailableError);
  });
});
