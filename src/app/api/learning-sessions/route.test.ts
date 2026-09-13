import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AIRateLimitedError, AIUnavailableError } from "@/server/ai/errors";
import {
  LearningSessionStartInProgressError,
  LearningSessionTargetUnavailableError,
} from "@/server/learning/errors";

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

  it("returns an honest 503 when a live tutor is not configured", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    createLearningSessionMock.mockRejectedValue(
      new AIUnavailableError({ reason: "provider_not_configured" }),
    );
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientStartId: "00000000-0000-4000-8000-000000000001", mode: "MISSION", scenarioKey: "cafe-order" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Gia sư AI hiện chưa sẵn sàng. Vui lòng thử lại sau.",
      code: "AI_UNAVAILABLE",
    });
  });

  it("returns a bounded retry hint when the live tutor is rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    createLearningSessionMock.mockRejectedValue(
      new AIRateLimitedError({
        reason: "rate_limited",
        retryAfterSeconds: 15,
      }),
    );
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientStartId: "00000000-0000-4000-8000-000000000002", mode: "MISSION", scenarioKey: "cafe-order" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    await expect(response.json()).resolves.toEqual({
      error: "Gia sư AI đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
      code: "AI_RATE_LIMITED",
      retryAfterSeconds: 15,
    });
  });

  it("returns 201 only for a fresh start and 200 for the same-key replay", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    const request = () => new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientStartId: "00000000-0000-4000-8000-000000000003", mode: "MISSION", scenarioKey: "cafe-order" }),
    });
    createLearningSessionMock.mockResolvedValueOnce({ session: { id: "session-1" }, idempotent: false });
    createLearningSessionMock.mockResolvedValueOnce({ session: { id: "session-1" }, idempotent: true });

    const created = await POST(request());
    const replayed = await POST(request());

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual({ session: { id: "session-1" } });
  });

  it("does not call the service for a missing or malformed start key", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "MISSION", scenarioKey: "cafe-order" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createLearningSessionMock).not.toHaveBeenCalled();
  });

  it("keeps the server retry window in both the header and public body", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    createLearningSessionMock.mockRejectedValue(new LearningSessionStartInProgressError());
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientStartId: "00000000-0000-4000-8000-000000000004", mode: "MISSION", scenarioKey: "cafe-order" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({
      code: "START_IN_PROGRESS",
      retryAfterSeconds: 2,
    });
  });

  it("returns a typed 404 when a selected authored target is no longer available", async () => {
    authMock.mockResolvedValue({ user: { id: "learner-1" } });
    createLearningSessionMock.mockRejectedValue(new LearningSessionTargetUnavailableError());
    const request = new NextRequest("http://localhost/api/learning-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientStartId: "00000000-0000-4000-8000-000000000005", mode: "MISSION", scenarioKey: "retired-scenario" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });
});
