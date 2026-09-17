import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicLearningSession } from "@/features/learning-session/types";

const mocks = vi.hoisted(() => ({ plan: vi.fn(), warn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/learning/planner", () => ({ planNextLearningAction: mocks.plan }));
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn } }));

import { withCompletedNextAction } from "./next-action";

function session(status: PublicLearningSession["status"]) {
  return { id: "session-1", status } as PublicLearningSession;
}

describe("withCompletedNextAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves active session envelopes untouched by optional recommendation work", async () => {
    const result = await withCompletedNextAction("learner-1", { session: session("ACTIVE"), idempotent: false });

    expect(result).toMatchObject({ nextAction: null, idempotent: false });
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("treats an ABANDONED session as terminal and attaches a next action (Plan13)", async () => {
    const decision = { kind: "EMPTY" as const, reasonCode: "NO_CONTENT" as const, reasonVi: "", evidenceRefs: [], estimatedMinutes: 10, decisionVersion: "p11-v1" as const, basis: { kind: "INSUFFICIENT_EVIDENCE" as const } };
    mocks.plan.mockResolvedValue(decision);

    const result = await withCompletedNextAction("learner-1", { session: session("ABANDONED") });

    expect(result.nextAction).toEqual(decision);
  });

  it("returns the completed session when recommendation computation fails", async () => {
    mocks.plan.mockRejectedValue(new Error("storage unavailable"));

    const result = await withCompletedNextAction("learner-1", { session: session("COMPLETED") });

    expect(result).toMatchObject({ session: { id: "session-1" }, nextAction: null });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("uses the same planner decision contract as the dashboard after completion", async () => {
    const decision = {
      kind: "REVIEW" as const,
      reasonCode: "DUE_REVIEW" as const,
      reasonVi: "Ôn từ đến hạn trước.",
      evidenceRefs: [],
      estimatedMinutes: 10 as const,
      decisionVersion: "p08-v1" as const,
    };
    mocks.plan.mockResolvedValue(decision);

    const result = await withCompletedNextAction("learner-1", { session: session("COMPLETED") });

    expect(mocks.plan).toHaveBeenCalledWith("learner-1");
    expect(result.nextAction).toEqual(decision);
  });

  it("propagates p11-v1 decision with causal basis after session completion", async () => {
    const decision = {
      kind: "COACH" as const,
      targetId: "lesson-1",
      reasonCode: "SKILL_PRACTICE" as const,
      reasonVi: "Luyện bài học cùng Coach.",
      evidenceRefs: [{ source: "LEARNING" as const, id: "evidence-1" }],
      estimatedMinutes: 10 as const,
      decisionVersion: "p11-v1" as const,
      basis: {
        kind: "EVIDENCE" as const,
        skillKey: "listening",
        refs: [{ source: "LEARNING" as const, id: "evidence-1" }],
      },
    };
    mocks.plan.mockResolvedValue(decision);

    const result = await withCompletedNextAction("learner-1", { session: session("COMPLETED") });

    expect(mocks.plan).toHaveBeenCalledWith("learner-1");
    expect(result.nextAction).toEqual(decision);
  });
});
