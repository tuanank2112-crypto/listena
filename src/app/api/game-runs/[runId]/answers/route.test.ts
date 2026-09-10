import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), submitAnswer: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/adaptive-games/service", () => ({
  submitAdaptiveGameAnswer: mocks.submitAnswer,
}));

import { POST } from "./route";

describe("POST /api/game-runs/:runId/answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
  });

  it("rejects a correctness claim and does not call the server grader", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/game-runs/run/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: "00000000-0000-4000-8000-000000000010",
          answer: "quả táo",
          clientAnswerId: "00000000-0000-4000-8000-000000000001",
          correct: true,
        }),
      }),
      { params: Promise.resolve({ runId: "00000000-0000-4000-8000-000000000020" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "VALIDATION_ERROR" });
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
  });
});

