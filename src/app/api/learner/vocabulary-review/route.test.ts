import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseConfigurationError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  mastery: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  vocabularyMastery: { findMany: mocks.mastery },
} }));

import { GET } from "./route";

function record(overrides: {
  id: string;
  correctCount?: number;
  incorrectCount?: number;
  masteryScore?: number;
  nextReviewAt?: Date | null;
  meaningVi?: string;
}) {
  return {
    vocabularyItemId: overrides.id,
    correctCount: overrides.correctCount ?? 0,
    incorrectCount: overrides.incorrectCount ?? 0,
    masteryScore: overrides.masteryScore ?? 0,
    nextReviewAt: overrides.nextReviewAt ?? null,
    vocabularyItem: {
      displayText: overrides.id,
      meaningVi: overrides.meaningVi ?? `nghĩa ${overrides.id}`,
      ipa: null,
    },
  };
}

describe("GET /api/learner/vocabulary-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.mastery.mockResolvedValue([]);
  });

  it("refuses an anonymous caller", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.mastery).not.toHaveBeenCalled();
  });

  it("reads only the caller's own mastery rows", async () => {
    await GET();
    expect(mocks.mastery).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "learner-1" },
    }));
  });

  it("reports the missed words worst first and counts the standings", async () => {
    mocks.mastery.mockResolvedValue([
      record({ id: "often", correctCount: 1, incorrectCount: 4 }),
      record({ id: "learned", correctCount: 3, incorrectCount: 0 }),
      record({ id: "once", correctCount: 3, incorrectCount: 1 }),
    ]);

    const body = await (await GET()).json();

    expect(body.weakWords.map((word: { displayText: string }) => word.displayText)).toEqual(["often", "once"]);
    expect(body).toMatchObject({ seenCount: 3, learnedCount: 1, weakCount: 2 });
  });

  it("cleans the stored meaning the same way every other vocabulary surface does", async () => {
    mocks.mastery.mockResolvedValue([
      record({ id: "suitcase", incorrectCount: 1, meaningVi: "va li. I packed my suitcase" }),
    ]);

    const body = await (await GET()).json();

    expect(body.weakWords[0].meaningVi).toBe("va li");
  });

  it("never returns more random words than the pool has", async () => {
    mocks.mastery.mockResolvedValue([record({ id: "only" })]);
    const body = await (await GET()).json();
    expect(body.randomReview).toHaveLength(1);
  });

  it("hands a database configuration failure to the shared opaque response", async () => {
    mocks.mastery.mockRejectedValue(new DatabaseConfigurationError());
    const response = await GET();
    expect(response.status).toBeGreaterThanOrEqual(500);
    // The learner must never read the server's own configuration message.
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("Database configuration");
  });
});
