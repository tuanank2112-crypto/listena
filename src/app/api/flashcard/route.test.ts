import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reviewFlashcard: vi.fn(), error: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/services/learning", () => ({ reviewFlashcard: mocks.reviewFlashcard }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));

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
      }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
