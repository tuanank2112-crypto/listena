import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, createLearningSessionMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createLearningSessionMock: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: authMock }));
vi.mock("@/server/learning/service", () => ({
  createLearningSession: createLearningSessionMock,
}));

import { POST } from "./route";

describe("POST /api/learning-sessions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createLearningSessionMock.mockReset();
  });

  it("rejects unauthenticated requests before parsing or calling the service", async () => {
    authMock.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createLearningSessionMock).not.toHaveBeenCalled();
  });
});
