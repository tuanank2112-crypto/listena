import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  profile: vi.fn(),
  skillMastery: vi.fn(),
  vocabulary: vi.fn(),
  vocabularyMastery: vi.fn(),
  evidence: vi.fn(),
  gameRuns: vi.fn(),
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
  },
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
