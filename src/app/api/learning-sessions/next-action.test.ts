import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicLearningSession } from "@/features/learning-session/types";

const mocks = vi.hoisted(() => ({ compute: vi.fn(), warn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/learning/next-action", () => ({ computeNextAction: mocks.compute }));
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
    expect(mocks.compute).not.toHaveBeenCalled();
  });

  it("returns the completed session when recommendation computation fails", async () => {
    mocks.compute.mockRejectedValue(new Error("storage unavailable"));

    const result = await withCompletedNextAction("learner-1", { session: session("COMPLETED") });

    expect(result).toMatchObject({ session: { id: "session-1" }, nextAction: null });
    expect(mocks.warn).toHaveBeenCalled();
  });
});
