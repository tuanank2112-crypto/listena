import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";
import { IdempotencyConflictError, OutcomePendingError } from "@/lib/idempotency";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reviewFlashcard: vi.fn(), error: vi.fn(), warn: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/services/learning", () => ({ reviewFlashcard: mocks.reviewFlashcard }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error, warn: mocks.warn } }));

import { POST } from "./route";

describe("POST /api/flashcard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
  });

  it("returns an opaque 503 when the review persistence service fails", async () => {
    mocks.reviewFlashcard.mockRejectedValue(new DatabaseUnavailableError());

    const response = await POST(new Request("http://localhost/api/flashcard", {
      method: "POST",
      body: JSON.stringify({
        flashcardId: "00000000-0000-4000-8000-000000000001",
        rating: "GOOD",
        clientReviewId: "00000000-0000-4000-8000-000000000004",
      }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("returns 409 IDEMPOTENCY_CONFLICT on payload mismatch for same key", async () => {
    mocks.reviewFlashcard.mockRejectedValue(new IdempotencyConflictError("Key conflict"));

    const response = await POST(new Request("http://localhost/api/flashcard", {
      method: "POST",
      body: JSON.stringify({
        flashcardId: "00000000-0000-4000-8000-000000000001",
        rating: "HARD",
        clientReviewId: "00000000-0000-4000-8000-000000000004",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("returns 409 with Retry-After on concurrent revision schedule collision", async () => {
    mocks.reviewFlashcard.mockRejectedValue(new OutcomePendingError(3, "Schedule stale"));

    const response = await POST(new Request("http://localhost/api/flashcard", {
      method: "POST",
      body: JSON.stringify({
        flashcardId: "00000000-0000-4000-8000-000000000001",
        rating: "GOOD",
        clientReviewId: "00000000-0000-4000-8000-000000000004",
      }),
    }));

    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({ code: "OUTCOME_PENDING" });
  });

  it("returns 200 with replayed true on exact replay", async () => {
    mocks.reviewFlashcard.mockResolvedValue({
      replayed: true,
      value: { reviewLogId: "log-1", intervalDays: 3 },
    });

    const response = await POST(new Request("http://localhost/api/flashcard", {
      method: "POST",
      body: JSON.stringify({
        flashcardId: "00000000-0000-4000-8000-000000000001",
        rating: "GOOD",
        clientReviewId: "00000000-0000-4000-8000-000000000004",
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replayed: true, reviewLogId: "log-1" });
  });
});
