import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";
import { IdempotencyConflictError } from "@/lib/idempotency";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), submitAttempt: vi.fn(), error: vi.fn(), warn: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/services/learning", () => ({ submitAttempt: mocks.submitAttempt }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error, warn: mocks.warn, info: vi.fn() } }));

import { POST } from "./route";

describe("POST /api/attempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
  });

  it("returns an opaque 503 when the learning persistence service fails", async () => {
    mocks.submitAttempt.mockRejectedValue(new DatabaseUnavailableError());

    const response = await POST(new Request("http://localhost/api/attempt", {
      method: "POST",
      body: JSON.stringify({
        exerciseId: "00000000-0000-4000-8000-000000000001",
        lessonId: "00000000-0000-4000-8000-000000000002",
        submittedAnswer: "answer",
        clientAttemptId: "00000000-0000-4000-8000-000000000003",
      }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("returns 409 IDEMPOTENCY_CONFLICT when the same clientAttemptId is used with different body", async () => {
    mocks.submitAttempt.mockRejectedValue(new IdempotencyConflictError("Idempotency key conflict"));

    const response = await POST(new Request("http://localhost/api/attempt", {
      method: "POST",
      body: JSON.stringify({
        exerciseId: "00000000-0000-4000-8000-000000000001",
        lessonId: "00000000-0000-4000-8000-000000000002",
        submittedAnswer: "different answer",
        clientAttemptId: "00000000-0000-4000-8000-000000000003",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("returns 200 on exact replay and 201 on new commit", async () => {
    mocks.submitAttempt.mockResolvedValueOnce({
      replayed: false,
      value: { attemptId: "attempt-1", score: 100 },
    });

    const resNew = await POST(new Request("http://localhost/api/attempt", {
      method: "POST",
      body: JSON.stringify({
        exerciseId: "00000000-0000-4000-8000-000000000001",
        lessonId: "00000000-0000-4000-8000-000000000002",
        submittedAnswer: "answer",
        clientAttemptId: "00000000-0000-4000-8000-000000000003",
      }),
    }));
    expect(resNew.status).toBe(201);
    await expect(resNew.json()).resolves.toMatchObject({ replayed: false, attemptId: "attempt-1" });

    mocks.submitAttempt.mockResolvedValueOnce({
      replayed: true,
      value: { attemptId: "attempt-1", score: 100 },
    });

    const resReplay = await POST(new Request("http://localhost/api/attempt", {
      method: "POST",
      body: JSON.stringify({
        exerciseId: "00000000-0000-4000-8000-000000000001",
        lessonId: "00000000-0000-4000-8000-000000000002",
        submittedAnswer: "answer",
        clientAttemptId: "00000000-0000-4000-8000-000000000003",
      }),
    }));
    expect(resReplay.status).toBe(200);
    await expect(resReplay.json()).resolves.toMatchObject({ replayed: true, attemptId: "attempt-1" });
  });
});
