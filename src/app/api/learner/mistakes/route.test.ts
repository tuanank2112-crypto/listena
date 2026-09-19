import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseConfigurationError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  memory: vi.fn(),
  turns: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));
vi.mock("@/server/learner-memory/repository", () => ({ getLearnerMemory: mocks.memory }));
vi.mock("@/lib/prisma", () => ({ prisma: { learningTurn: { findMany: mocks.turns } } }));

import { GET } from "./route";

let sequence = 0;
const base = () => {
  sequence += 1;
  return {
    sessionId: "s1",
    sequence,
    createdAt: new Date(`2026-09-19T10:00:${String(sequence).padStart(2, "0")}.000Z`),
    session: { goal: "Đặt món" },
  };
};
const learnerTurn = (message: string) => ({
  ...base(),
  actor: "LEARNER",
  contentJson: JSON.stringify({ message }),
});
const aiTurn = (type: string, actual: string) => ({
  ...base(),
  actor: "AI",
  contentJson: JSON.stringify({ detectedError: { type, actual, explanationVi: "Giải thích." } }),
});

describe("GET /api/learner/mistakes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.memory.mockResolvedValue(null);
    mocks.turns.mockResolvedValue([]);
  });

  it("refuses an anonymous caller before touching the database", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.turns).not.toHaveBeenCalled();
    expect(mocks.memory).not.toHaveBeenCalled();
  });

  it("reads only the caller's own AI turns", async () => {
    await GET();
    expect(mocks.memory).toHaveBeenCalledWith("learner-1");
    expect(mocks.turns).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor: { in: ["LEARNER", "AI"] }, session: { userId: "learner-1" } },
    }));
  });

  it("names every mistake in Vietnamese and folds the model's spellings together", async () => {
    mocks.memory.mockResolvedValue({
      recurringErrors: [
        { errorType: "tense", count: 2, lastEvidenceId: "e1" },
        { errorType: "verb_tense", count: 3, lastEvidenceId: "e2" },
      ],
    });
    mocks.turns.mockResolvedValue([
      learnerTurn("I lose my bag"),
      aiTurn("tense", "I lose"),
      learnerTurn("I go there"),
      aiTurn("past simple", "I go"),
    ]);

    const body = await (await GET()).json();

    expect(body.families).toHaveLength(1);
    expect(body.families[0]).toMatchObject({ key: "tense", labelVi: "Thì của động từ", count: 5 });
    expect(body.families[0].examples).toHaveLength(2);
    expect(body.correctedTurnCount).toBe(2);
  });

  it("quotes the learner's own sentence and points inside it", async () => {
    mocks.turns.mockResolvedValue([
      learnerTurn("Yesterday I lose my suitcase."),
      aiTurn("tense", "lose"),
    ]);

    const body = await (await GET()).json();

    expect(body.families[0].examples[0]).toMatchObject({
      learnerText: "Yesterday I lose my suitcase.",
      highlights: ["lose"],
    });
  });

  it("marks nothing when the model described the mistake instead of quoting it", async () => {
    mocks.turns.mockResolvedValue([
      learnerTurn("I arrived in Monday."),
      aiTurn("tense", "present tense with incorrect verb form"),
    ]);

    const body = await (await GET()).json();

    expect(body.families[0].examples[0]).toMatchObject({
      learnerText: "I arrived in Monday.",
      highlights: [],
    });
  });

  it("returns an empty history rather than failing for a learner with nothing yet", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ families: [], correctedTurnCount: 0 });
  });

  it("hands a database configuration failure to the shared opaque response", async () => {
    mocks.turns.mockRejectedValue(new DatabaseConfigurationError());
    const response = await GET();
    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("Database configuration");
  });
});
