import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIMisconfiguredError, AIRequestBudgetError } from "@/server/ai/errors";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  provider: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  generateLesson: vi.fn(),
  writeTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lessonCreationRequest: { findUnique: mocks.findUnique, create: mocks.create, updateMany: mocks.updateMany },
    course: { findUnique: vi.fn(), findFirst: vi.fn(async () => ({ id: "course-1" })), create: vi.fn() },
    vocabularyItem: { upsert: vi.fn(async () => ({ id: "vocab-1" })) },
    lesson: { findFirst: vi.fn(async () => ({ id: "lesson-1" })) },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  libSqlTimestamp: (value: Date) => value.getTime(),
  withLibSqlWriteTransaction: mocks.writeTransaction,
}));
vi.mock("@/server/ai/provider", () => ({ createAIProviderFromEnv: mocks.provider }));
vi.mock("@/server/ai/request-budget", () => ({
  reserveUserAICall: mocks.reserve,
  settleUserAICall: mocks.settle,
}));

import {
  generateLessonFromRequest,
  LESSON_CREATION_AI_LEASE_MS,
  reserveLessonCreationRequest,
} from "./lesson-authoring";

const now = new Date("2026-09-17T12:00:00.000Z");
const request = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  topic: "Ordering coffee",
  cefrLevel: "A2" as const,
  learningObjectives: ["order a drink politely"],
};

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    userId: "teacher-1",
    clientRequestId: request.clientRequestId,
    requestHash: "hash",
    mode: "AI",
    status: "PENDING",
    lessonId: null,
    errorCode: null,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Plan13 SPEC-P131 §5 (AI3, AI4, D5).
describe("teacher lesson creation ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.create.mockResolvedValue(pendingRow());
    mocks.reserve.mockResolvedValue({ id: "ai-reservation", userId: "teacher-1", purpose: "lesson_generation" });
    mocks.settle.mockResolvedValue(undefined);
  });

  it("reclaims an expired PENDING lease as FAILED (LEASE_EXPIRED) and lets a new claim proceed", async () => {
    // Regression for AI4: previously the row stayed PENDING forever and every
    // retry answered "pending, retry in 1s".
    mocks.findUnique.mockResolvedValue(pendingRow({ leaseExpiresAt: new Date(now.getTime() - 1_000) }));

    const result = await reserveLessonCreationRequest({
      userId: "teacher-1", clientRequestId: request.clientRequestId, requestHash: "hash", mode: "AI", now,
    });

    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "request-1", status: "PENDING", leaseExpiresAt: { lt: now } },
      data: { status: "FAILED", errorCode: "LEASE_EXPIRED" },
    }));
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "request-1", status: "FAILED" },
      data: expect.objectContaining({ status: "PENDING", errorCode: null }),
    }));
    expect(result).toEqual({ kind: "reserved", requestId: "request-1" });
    expect(LESSON_CREATION_AI_LEASE_MS).toBe(210_000);
  });

  it("keeps a live PENDING lease pending with a bounded retry", async () => {
    mocks.findUnique.mockResolvedValue(pendingRow());
    await expect(reserveLessonCreationRequest({
      userId: "teacher-1", clientRequestId: request.clientRequestId, requestHash: "hash", mode: "AI", now,
    })).resolves.toEqual({ kind: "pending", retryAfterSeconds: 30 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("moves the claimed row to FAILED when the provider is misconfigured or the budget refuses (AI3)", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.provider.mockImplementation(() => { throw new AIMisconfiguredError({ reason: "upstream_model_not_found" }); });

    await expect(generateLessonFromRequest({
      userId: "teacher-1", role: "TEACHER", clientRequestId: request.clientRequestId, request,
    })).rejects.toMatchObject({ code: "AI_MISCONFIGURED" });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: expect.any(String), status: "PENDING" },
      data: { status: "FAILED", errorCode: "AI_MISCONFIGURED" },
    });

    mocks.provider.mockReturnValue({ providerName: "vyce", modelName: "m", generateLesson: mocks.generateLesson });
    mocks.reserve.mockRejectedValueOnce(new AIRequestBudgetError({ reason: "COOLDOWN", retryAfterSeconds: 9 }));
    await expect(generateLessonFromRequest({
      userId: "teacher-1", role: "TEACHER", clientRequestId: request.clientRequestId, request,
    })).rejects.toMatchObject({ code: "AI_REQUEST_LIMIT" });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: expect.any(String), status: "PENDING" },
      data: { status: "FAILED", errorCode: "AI_REQUEST_LIMIT" },
    });
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("settles the AI reservation exactly once even when the graph commit fails, and guards the UNKNOWN write on PENDING (D5)", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.provider.mockReturnValue({ providerName: "vyce", modelName: "m", generateLesson: mocks.generateLesson });
    mocks.generateLesson.mockResolvedValue({
      title: "Coffee",
      transcript: "Can I have a coffee, please?",
      segments: [{ position: 1, text: "Can I have a coffee, please?", difficulty: 1 }],
      vocabulary: [{ lemma: "coffee", displayText: "coffee", meaningVi: "cà phê", cefrLevel: "A1" }],
      exercises: [{ type: "GIST", prompt: "What does she order?", correctAnswer: "coffee", difficulty: 1, position: 1 }],
    });
    mocks.writeTransaction.mockRejectedValue(new Error("commit lost"));

    await expect(generateLessonFromRequest({
      userId: "teacher-1", role: "TEACHER", clientRequestId: request.clientRequestId, request,
    })).rejects.toThrow("commit lost");

    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: true }));
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: expect.any(String), status: "PENDING" },
      data: { status: "UNKNOWN", errorCode: "BATCH_COMMIT_FAILED" },
    });
  });
});
