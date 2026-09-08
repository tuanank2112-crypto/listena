import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  vocabularyMastery: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { learnerRepo } from "./learner";

describe("learnerRepo.upsertVocabularyMastery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.vocabularyMastery.upsert.mockResolvedValue({ id: "mastery-1" });
  });

  it("increments existing counters atomically through the composite upsert", async () => {
    await learnerRepo.upsertVocabularyMastery("user-1", "vocab-1", {
      masteryScore: 0.8,
      correctCount: 1,
      incorrectCount: 0,
    });

    expect(prismaMock.vocabularyMastery.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.vocabularyMastery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_vocabularyItemId: { userId: "user-1", vocabularyItemId: "vocab-1" } },
      update: expect.objectContaining({
        masteryScore: 0.8,
        correctCount: { increment: 1 },
        incorrectCount: { increment: 0 },
      }),
    }));
    expect(prismaMock.vocabularyMastery.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.vocabularyMastery.update).not.toHaveBeenCalled();
    expect(prismaMock.vocabularyMastery.create).not.toHaveBeenCalled();
  });

  it("keeps existing counters unchanged when count deltas are omitted and defaults new rows", async () => {
    await learnerRepo.upsertVocabularyMastery("user-1", "vocab-1", {
      masteryScore: 0.4,
    });

    expect(prismaMock.vocabularyMastery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: "user-1",
        vocabularyItemId: "vocab-1",
        masteryScore: 0.4,
        correctCount: 0,
        incorrectCount: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        repetitionCount: 0,
      }),
      update: { masteryScore: 0.4 },
    }));
  });
});
