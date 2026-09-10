import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  profile: vi.fn(),
  skillMastery: vi.fn(),
  vocabulary: vi.fn(),
  vocabularyMastery: vi.fn(),
  evidence: vi.fn(),
  gameRuns: vi.fn(),
  gameRound: vi.fn(),
  gameRoundList: vi.fn(),
  nativeD1: vi.fn(),
  nativeBatch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    learnerProfile: { findUnique: mocks.profile },
    skillMastery: { findMany: mocks.skillMastery },
    vocabularyItem: { findMany: mocks.vocabulary },
    vocabularyMastery: { findMany: mocks.vocabularyMastery },
    adaptiveEvidence: { findMany: mocks.evidence },
    adaptiveGameRun: { findMany: mocks.gameRuns },
    adaptiveGameRound: { findFirst: mocks.gameRound, findMany: mocks.gameRoundList },
  },
  getNativeD1Database: mocks.nativeD1,
}));

vi.mock("@/lib/d1-batch", () => ({
  d1Boolean: (value: boolean) => value ? 1 : 0,
  d1Timestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  executeNativeD1Batch: mocks.nativeBatch,
}));

import {
  createAdaptiveGameRun,
  submitAdaptiveGameAnswer,
} from "./service";
import {
  AdaptiveGamePrivateNotFoundError,
  AdaptiveGameRateLimitError,
} from "./errors";
import { normalizeText } from "@/core/text/normalize";

function vocabulary(id: string) {
  return {
    id,
    lemma: `lemma-${id}`,
    displayText: `word-${id}`,
    meaningVi: `nghĩa-${id}`,
    ipa: null,
    exampleSentence: null,
    audioUrl: null,
    cefrLevel: "A2",
  };
}

const publicJson = JSON.stringify({
  kind: "quiz",
  prompt: "Chọn nghĩa đúng",
  word: "apple",
  ipa: null,
  options: ["quả táo", "quả lê", "quả cam"],
  difficulty: 0.5,
});
const validatorJson = JSON.stringify({
  kind: "quiz",
  normalizedExpectedAnswer: normalizeText("quả táo"),
});

describe("adaptive game service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nativeD1.mockReturnValue(undefined);
  });

  it("only selects READY personalized vocabulary owned by the learner and omits validators from the run DTO", async () => {
    mocks.profile.mockResolvedValue({ vocabularyMastery: 0.25, spellingMastery: 0.25 });
    mocks.skillMastery.mockResolvedValue([]);
    mocks.vocabulary.mockResolvedValue(Array.from({ length: 8 }, (_, index) => vocabulary(String(index + 1))));
    mocks.vocabularyMastery.mockResolvedValue([]);
    mocks.evidence.mockResolvedValue([]);
    mocks.gameRuns.mockResolvedValue([]);
    const tx = {
      adaptiveGameRun: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), create: vi.fn() },
      adaptiveGameRound: { createMany: vi.fn() },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const run = await createAdaptiveGameRun("learner-1", { mode: "QUIZ" });

    expect(mocks.vocabulary).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        personalizedLessons: {
          some: { personalizedLesson: { userId: "learner-1", status: "READY" } },
        },
      },
    }));
    expect(run.rounds).toHaveLength(8);
    expect(JSON.stringify(run)).not.toContain("validatorJson");
    expect(JSON.stringify(run)).not.toContain("normalizedExpectedAnswer");
    expect(tx.adaptiveGameRound.createMany).toHaveBeenCalledTimes(1);
    expect(tx.adaptiveGameRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "learner-1" }),
      take: 12,
    }));
  });

  it("uses one guarded native D1 batch for expiry, run and every private round", async () => {
    mocks.profile.mockResolvedValue({ vocabularyMastery: 0.25, spellingMastery: 0.25 });
    mocks.skillMastery.mockResolvedValue([]);
    mocks.vocabulary.mockResolvedValue(Array.from({ length: 8 }, (_, index) => vocabulary(String(index + 1))));
    mocks.vocabularyMastery.mockResolvedValue([]);
    mocks.evidence.mockResolvedValue([]);
    mocks.gameRuns.mockResolvedValue([]);
    mocks.nativeD1.mockReturnValue({});
    mocks.nativeBatch.mockResolvedValue(Array.from({ length: 10 }, () => ({
      success: true,
      meta: { changes: 1 },
    })));

    const run = await createAdaptiveGameRun("learner-1", { mode: "QUIZ" });

    expect(run.rounds).toHaveLength(8);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.nativeBatch).toHaveBeenCalledTimes(1);
    const statements = mocks.nativeBatch.mock.calls[0]?.[0] as Array<{ sql: string }>;
    expect(statements).toHaveLength(10);
    expect(statements[0]?.sql).toContain("INSERT INTO \"AdaptiveGameRun\"");
    expect(statements[0]?.sql).toContain("WHERE NOT EXISTS");
    expect(statements[0]?.sql).toContain("SELECT COUNT(*) FROM \"AdaptiveGameRun\"");
    expect(statements[1]?.sql).toContain("SET \"status\" = 'EXPIRED'");
    expect(statements.slice(2).every((statement) => statement.sql.includes("WHERE EXISTS"))).toBe(true);
  });

  it("blocks a fresh run before candidate selection when the server-owned cooldown applies", async () => {
    mocks.gameRuns.mockResolvedValue([{ startedAt: new Date(Date.now() - 1_000) }]);

    await expect(createAdaptiveGameRun("learner-1", { mode: "QUIZ" }))
      .rejects.toBeInstanceOf(AdaptiveGameRateLimitError);

    expect(mocks.gameRuns).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "learner-1" }),
      take: 12,
      select: { startedAt: true },
    }));
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates evidence and both mastery updates exactly once when the same client answer is replayed", async () => {
    const clientAnswerId = "00000000-0000-4000-8000-000000000001";
    const round = {
      id: "round-1",
      position: 0,
      publicJson,
      validatorJson,
      answeredAt: null as Date | null,
      clientAnswerId: null as string | null,
      correct: null as boolean | null,
      score: null as number | null,
      responseTimeMs: null as number | null,
      feedbackVi: null as string | null,
      vocabularyItemId: "word-1",
      run: {
        status: "ACTIVE" as const,
        expiresAt: new Date(Date.now() + 60_000),
        targetSkill: "vocabulary",
        difficulty: 0.5,
      },
    };
    const nextRound = { id: "round-2", position: 1, publicJson };
    const tx = {
      adaptiveGameRound: {
        findFirst: vi.fn().mockImplementation(async () => round),
        findMany: vi.fn().mockResolvedValue([round, nextRound]),
        updateMany: vi.fn().mockImplementation(async () => {
          round.clientAnswerId = clientAnswerId;
          round.answeredAt = new Date();
          round.correct = true;
          round.score = 1;
          round.feedbackVi = "Chính xác. Từ này sẽ được lên lịch ôn phù hợp.";
          return { count: 1 };
        }),
      },
      vocabularyMastery: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      skillMastery: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      adaptiveEvidence: { create: vi.fn().mockResolvedValue({}) },
      adaptiveGameRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const input = {
      roundId: "00000000-0000-4000-8000-000000000010",
      answer: "quả táo",
      clientAnswerId,
      responseTimeMs: 2_000,
    };
    const first = await submitAdaptiveGameAnswer("learner-1", "00000000-0000-4000-8000-000000000020", input);
    const replay = await submitAdaptiveGameAnswer("learner-1", "00000000-0000-4000-8000-000000000020", input);

    expect(first).toMatchObject({ correct: true, idempotent: false });
    expect(replay).toMatchObject({ correct: true, idempotent: true });
    expect(JSON.stringify(first)).not.toContain("normalizedExpectedAnswer");
    expect(JSON.stringify(first)).not.toContain("validatorJson");
    expect(tx.adaptiveEvidence.create).toHaveBeenCalledTimes(1);
    expect(tx.vocabularyMastery.upsert).toHaveBeenCalledTimes(1);
    expect(tx.skillMastery.upsert).toHaveBeenCalledTimes(1);
  });

  it("uses a native D1 claim token so only the batch that wins the round can write evidence and mastery", async () => {
    const clientAnswerId = "00000000-0000-4000-8000-000000000001";
    const round = {
      id: "round-1",
      position: 0,
      publicJson,
      validatorJson,
      answeredAt: null as Date | null,
      clientAnswerId: null as string | null,
      correct: null as boolean | null,
      score: null as number | null,
      responseTimeMs: null as number | null,
      feedbackVi: null as string | null,
      vocabularyItemId: "word-1",
      run: {
        status: "ACTIVE" as const,
        expiresAt: new Date(Date.now() + 60_000),
        targetSkill: "vocabulary",
        difficulty: 0.5,
      },
    };
    const nextRound = { id: "round-2", position: 1, publicJson };
    const database = createClient({ url: "file::memory:" });
    await database.batch([
      {
        sql: `CREATE TABLE "AdaptiveGameRun" (
          "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "mode" TEXT NOT NULL,
          "status" TEXT NOT NULL, "targetSkill" TEXT NOT NULL, "difficulty" REAL NOT NULL,
          "selectionSnapshotHash" TEXT NOT NULL, "startedAt" TEXT NOT NULL,
          "completedAt" TEXT, "expiresAt" TEXT NOT NULL
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE "AdaptiveGameRound" (
          "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL, "position" INTEGER NOT NULL,
          "vocabularyItemId" TEXT NOT NULL, "publicJson" TEXT NOT NULL,
          "validatorJson" TEXT NOT NULL, "answeredAt" TEXT, "correct" INTEGER,
          "score" REAL, "clientAnswerId" TEXT, "responseTimeMs" INTEGER,
          "feedbackVi" TEXT, UNIQUE("runId", "position"), UNIQUE("runId", "clientAnswerId")
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE "VocabularyMastery" (
          "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "vocabularyItemId" TEXT NOT NULL,
          "masteryScore" REAL NOT NULL, "correctCount" INTEGER NOT NULL,
          "incorrectCount" INTEGER NOT NULL, "lastReviewedAt" TEXT, "nextReviewAt" TEXT,
          "intervalDays" REAL NOT NULL, "easeFactor" REAL NOT NULL,
          "repetitionCount" INTEGER NOT NULL, UNIQUE("userId", "vocabularyItemId")
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE "SkillMastery" (
          "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "skillKey" TEXT NOT NULL,
          "masteryScore" REAL NOT NULL, "evidenceCount" INTEGER NOT NULL,
          "lastUpdatedAt" TEXT NOT NULL, UNIQUE("userId", "skillKey")
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE "AdaptiveEvidence" (
          "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "sourceKind" TEXT NOT NULL,
          "sourceId" TEXT NOT NULL, "skillKey" TEXT NOT NULL, "vocabularyItemId" TEXT,
          "score" REAL NOT NULL, "confidence" REAL NOT NULL, "difficulty" REAL NOT NULL,
          "gradingMethod" TEXT NOT NULL, "responseTimeMs" INTEGER, "hintCount" INTEGER NOT NULL,
          "createdAt" TEXT NOT NULL, UNIQUE("sourceKind", "sourceId", "skillKey")
        )`,
        args: [],
      },
      {
        sql: `INSERT INTO "AdaptiveGameRun"
          ("id", "userId", "mode", "status", "targetSkill", "difficulty", "selectionSnapshotHash", "startedAt", "expiresAt")
          VALUES ('run-1', 'learner-1', 'QUIZ', 'ACTIVE', 'vocabulary', 0.5, 'snapshot', '2026-01-01T00:00:00.000+00:00', '2099-01-01T00:00:00.000+00:00')`,
        args: [],
      },
      {
        sql: `INSERT INTO "AdaptiveGameRound"
          ("id", "runId", "position", "vocabularyItemId", "publicJson", "validatorJson")
          VALUES ('round-1', 'run-1', 0, 'word-1', ?, ?)`,
        args: [publicJson, validatorJson],
      },
      {
        sql: `INSERT INTO "AdaptiveGameRound"
          ("id", "runId", "position", "vocabularyItemId", "publicJson", "validatorJson")
          VALUES ('round-2', 'run-1', 1, 'word-2', ?, ?)`,
        args: [publicJson, validatorJson],
      },
    ], "write");
    mocks.nativeD1.mockReturnValue({});
    mocks.gameRound.mockResolvedValue(round);
    mocks.gameRoundList.mockResolvedValue([round, nextRound]);
    mocks.nativeBatch.mockImplementation(async (statements: Array<{
      sql: string;
      values?: Array<string | number | null>;
    }>) => {
      const results = await database.batch(
        statements.map((statement) => ({ sql: statement.sql, args: statement.values ?? [] })),
        "write",
      );
      return results.map((result) => ({
        success: true,
        meta: { changes: Number(result.rowsAffected) },
      }));
    });

    const result = await submitAdaptiveGameAnswer("learner-1", "run-1", {
      roundId: "round-1",
      answer: "quả táo",
      clientAnswerId,
      responseTimeMs: 2_000,
    });

    expect(result).toMatchObject({ correct: true, idempotent: false, nextRound: { id: "round-2" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
    const statements = mocks.nativeBatch.mock.calls[0]?.[0] as Array<{
      sql: string;
      values: Array<string | number | null>;
    }>;
    expect(statements).toHaveLength(6);
    const claimToken = statements[0]?.values[0];
    expect(claimToken).toMatch(/^game-claim:/);
    expect(claimToken).not.toBe(clientAnswerId);
    expect(statements[0]?.sql).toContain("AND \"clientAnswerId\" IS NULL");
    expect(statements[0]?.sql).toContain("AND NOT EXISTS");
    expect(statements[1]?.sql).toContain("ON CONFLICT(\"userId\", \"vocabularyItemId\")");
    expect(statements[1]?.sql).toContain("\"VocabularyMastery\".\"masteryScore\" + ?");
    expect(statements[2]?.sql).toContain("ON CONFLICT(\"userId\", \"skillKey\")");
    expect(statements[3]?.sql).toContain("INSERT INTO \"AdaptiveEvidence\"");
    expect(statements[4]?.sql).toContain("SET \"status\" = 'COMPLETED'");
    expect(statements[5]?.values[0]).toBe(clientAnswerId);
    expect(statements.slice(1).every((statement) => statement.values.includes(claimToken as string))).toBe(true);
    const replay = await database.batch(
      statements.map((statement) => ({ sql: statement.sql, args: statement.values })),
      "write",
    );
    expect(replay[0]?.rowsAffected).toBe(0);
    const [storedRound, evidence, vocabularyMastery, skillMastery] = await Promise.all([
      database.execute({ sql: "SELECT \"clientAnswerId\", \"correct\", \"score\" FROM \"AdaptiveGameRound\" WHERE \"id\" = 'round-1'", args: [] }),
      database.execute({ sql: "SELECT COUNT(*) AS count FROM \"AdaptiveEvidence\"", args: [] }),
      database.execute({ sql: "SELECT \"masteryScore\", \"correctCount\" FROM \"VocabularyMastery\"", args: [] }),
      database.execute({ sql: "SELECT \"masteryScore\", \"evidenceCount\" FROM \"SkillMastery\"", args: [] }),
    ]);
    expect(storedRound.rows[0]).toMatchObject({ clientAnswerId, correct: 1, score: 1 });
    expect(evidence.rows[0]).toMatchObject({ count: 1 });
    expect(vocabularyMastery.rows[0]).toMatchObject({ masteryScore: 0.42, correctCount: 1 });
    expect(skillMastery.rows[0]).toMatchObject({ masteryScore: 0.59, evidenceCount: 1 });

    await database.batch([
      {
        sql: `INSERT INTO "AdaptiveGameRun"
          ("id", "userId", "mode", "status", "targetSkill", "difficulty", "selectionSnapshotHash", "startedAt", "expiresAt")
          VALUES ('run-2', 'learner-1', 'QUIZ', 'ACTIVE', 'vocabulary', 0.5, 'snapshot-2', '2026-01-01T00:00:00.000+00:00', '2099-01-01T00:00:00.000+00:00')`,
        args: [],
      },
      {
        sql: `INSERT INTO "AdaptiveGameRound"
          ("id", "runId", "position", "vocabularyItemId", "publicJson", "validatorJson")
          VALUES ('round-3', 'run-2', 0, 'word-1', ?, ?)`,
        args: [publicJson, validatorJson],
      },
    ], "write");
    const secondRound = {
      ...round,
      id: "round-3",
      run: { ...round.run },
    };
    mocks.gameRound.mockResolvedValue(secondRound);
    mocks.gameRoundList.mockResolvedValue([secondRound]);
    await submitAdaptiveGameAnswer("learner-1", "run-2", {
      roundId: "round-3",
      answer: "quả táo",
      clientAnswerId: "00000000-0000-4000-8000-000000000002",
      responseTimeMs: 2_000,
    });
    const [updatedVocabularyMastery, updatedSkillMastery] = await Promise.all([
      database.execute({ sql: "SELECT \"masteryScore\", \"correctCount\", \"intervalDays\", \"easeFactor\", \"repetitionCount\" FROM \"VocabularyMastery\"", args: [] }),
      database.execute({ sql: "SELECT \"masteryScore\", \"evidenceCount\" FROM \"SkillMastery\"", args: [] }),
    ]);
    expect(updatedVocabularyMastery.rows[0]).toMatchObject({
      masteryScore: 0.54,
      correctCount: 2,
      intervalDays: 13,
      easeFactor: 2.8,
      repetitionCount: 2,
    });
    expect(updatedSkillMastery.rows[0]).toMatchObject({ masteryScore: 0.6638, evidenceCount: 2 });
  });

  it("returns the stored result when a concurrent native D1 batch already finalized the same answer", async () => {
    const clientAnswerId = "00000000-0000-4000-8000-000000000001";
    const pendingRound = {
      id: "round-1",
      position: 0,
      publicJson,
      validatorJson,
      answeredAt: null as Date | null,
      clientAnswerId: null as string | null,
      correct: null as boolean | null,
      score: null as number | null,
      responseTimeMs: null as number | null,
      feedbackVi: null as string | null,
      vocabularyItemId: "word-1",
      run: {
        status: "ACTIVE" as const,
        expiresAt: new Date(Date.now() + 60_000),
        targetSkill: "vocabulary",
        difficulty: 0.5,
      },
    };
    const storedRound = {
      ...pendingRound,
      answeredAt: new Date(),
      clientAnswerId,
      correct: true,
      score: 1,
      feedbackVi: "Chính xác. Từ này sẽ được lên lịch ôn phù hợp.",
    };
    mocks.nativeD1.mockReturnValue({});
    mocks.gameRound.mockResolvedValueOnce(pendingRound).mockResolvedValueOnce(storedRound);
    mocks.gameRoundList.mockResolvedValue([pendingRound]);
    mocks.nativeBatch.mockResolvedValue(Array.from({ length: 6 }, () => ({
      success: true,
      meta: { changes: 0 },
    })));

    const result = await submitAdaptiveGameAnswer("learner-1", "run-1", {
      roundId: "round-1",
      answer: "quả táo",
      clientAnswerId,
    });

    expect(result).toMatchObject({ correct: true, score: 1, idempotent: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.gameRound).toHaveBeenCalledTimes(2);
  });

  it("does not reveal whether a foreign round exists", async () => {
    const tx = {
      adaptiveGameRound: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    await expect(submitAdaptiveGameAnswer("learner-1", "00000000-0000-4000-8000-000000000020", {
      roundId: "00000000-0000-4000-8000-000000000010",
      answer: "quả táo",
      clientAnswerId: "00000000-0000-4000-8000-000000000001",
    })).rejects.toBeInstanceOf(AdaptiveGamePrivateNotFoundError);
    expect(tx.adaptiveGameRound.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ run: { userId: "learner-1" } }),
    }));
  });
});
