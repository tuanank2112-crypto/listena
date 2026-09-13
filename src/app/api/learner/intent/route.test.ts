import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learner-intent", async () => {
  const actual = await vi.importActual<typeof import("@/server/learner-intent")>("@/server/learner-intent");
  return { ...actual, getLearnerIntent: mocks.get, updateLearnerIntent: mocks.update };
});
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));

import { GET, PUT } from "./route";

const intent = {
  goal: "Speak confidently at work",
  dailyMinutes: 10 as const,
  preferredTopics: ["work"],
  revision: "revision-1",
};

describe("/api/learner/intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.get.mockResolvedValue(intent);
    mocks.update.mockResolvedValue(intent);
  });

  it("requires a signed-in learner before reading intent", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns only the public intent snapshot", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(intent);
    expect(mocks.get).toHaveBeenCalledWith("learner-1");
  });

  it("rejects malformed writes before the persistence service", async () => {
    const response = await PUT(new NextRequest("http://localhost/api/learner/intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "x", dailyMinutes: 7, preferredTopics: [] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("passes a valid optimistic revision to the server-owned update", async () => {
    const response = await PUT(new NextRequest("http://localhost/api/learner/intent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("learner-1", intent);
  });
});
