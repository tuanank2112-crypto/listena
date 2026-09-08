import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), timeline: vi.fn(), error: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learning/timeline", () => ({ getLearnerTimeline: mocks.timeline }));
vi.mock("@/lib/logger", () => ({ default: { error: mocks.error } }));

import { GET } from "./route";

describe("GET /api/learner/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.timeline.mockResolvedValue({ items: [], weeklyStudyTime: 0 });
  });

  it("rejects unauthenticated requests before parsing or reading activity", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/learner/timeline?window=bad"));
    expect(response.status).toBe(401);
    expect(mocks.timeline).not.toHaveBeenCalled();
  });

  it.each([["7d", 7], ["30d", 30], [null, 7]] as const)("accepts %s as a %i-day window", async (window, expected) => {
    const suffix = window === null ? "" : `?window=${window}`;
    const response = await GET(new Request(`http://localhost/api/learner/timeline${suffix}`));
    expect(response.status).toBe(200);
    expect(mocks.timeline).toHaveBeenCalledWith("learner-1", expected);
    await expect(response.json()).resolves.toEqual({ items: [], weeklyStudyTime: 0 });
  });

  it("returns 400 for an invalid window without reading activity", async () => {
    const response = await GET(new Request("http://localhost/api/learner/timeline?window=14d"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid timeline window" });
    expect(mocks.timeline).not.toHaveBeenCalled();
  });
});
