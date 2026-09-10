import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), submitAttempt: vi.fn(), error: vi.fn(), warn: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/services/learning", () => ({ submitAttempt: mocks.submitAttempt }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error, warn: mocks.warn } }));

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
      }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
