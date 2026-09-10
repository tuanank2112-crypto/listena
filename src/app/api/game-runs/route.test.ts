import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createRun: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/adaptive-games/service", () => ({
  createAdaptiveGameRun: mocks.createRun,
}));

import { POST } from "./route";
import { AdaptiveGameRateLimitError } from "@/server/adaptive-games/errors";

describe("POST /api/game-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
  });

  it("rejects a browser-supplied correctness value before it reaches the selector", async () => {
    const response = await POST(new NextRequest("http://localhost/api/game-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "QUIZ", correct: true }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("returns a typed rate-limit response with Retry-After for fresh run creation", async () => {
    mocks.createRun.mockRejectedValue(new AdaptiveGameRateLimitError(
      9,
      "Bạn vừa tạo một lượt game. Hãy đợi một chút trước khi tạo lượt mới.",
    ));

    const response = await POST(new NextRequest("http://localhost/api/game-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "QUIZ" }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("9");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "GAME_RATE_LIMIT",
      message: "Bạn vừa tạo một lượt game. Hãy đợi một chút trước khi tạo lượt mới.",
      retryAfterSeconds: 9,
    });
  });
});
