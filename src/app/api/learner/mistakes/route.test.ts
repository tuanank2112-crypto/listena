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

const turn = (type: string, actual: string) => ({
  contentJson: JSON.stringify({ detectedError: { type, actual, explanationVi: "Giải thích." } }),
  createdAt: new Date("2026-09-19T10:00:00.000Z"),
  session: { goal: "Đặt món" },
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
      where: { actor: "AI", session: { userId: "learner-1" } },
    }));
  });

  it("names every mistake in Vietnamese and folds the model's spellings together", async () => {
    mocks.memory.mockResolvedValue({
      recurringErrors: [
        { errorType: "tense", count: 2, lastEvidenceId: "e1" },
        { errorType: "verb_tense", count: 3, lastEvidenceId: "e2" },
      ],
    });
    mocks.turns.mockResolvedValue([turn("tense", "I lose"), turn("past simple", "I go")]);

    const body = await (await GET()).json();

    expect(body.families).toHaveLength(1);
    expect(body.families[0]).toMatchObject({ key: "tense", labelVi: "Thì của động từ", count: 5 });
    expect(body.families[0].examples).toHaveLength(2);
    expect(body.correctedTurnCount).toBe(2);
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
