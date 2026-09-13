import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), plan: vi.fn() }));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/learning/planner", () => ({ planNextLearningAction: mocks.plan }));

import { GET } from "./route";

describe("GET /api/learner/next-action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "learner-1" } });
    mocks.plan.mockResolvedValue({
      kind: "CALIBRATE",
      reasonCode: "NO_EVIDENCE",
      reasonVi: "Bắt đầu một nhiệm vụ ngắn.",
      evidenceRefs: [],
      estimatedMinutes: 10,
      decisionVersion: "p08-v1",
    });
  });

  it("does not reveal a planner decision to an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("returns the server-owned decision for the authenticated learner", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ decision: { kind: "CALIBRATE" } });
    expect(mocks.plan).toHaveBeenCalledWith("learner-1");
  });
});
