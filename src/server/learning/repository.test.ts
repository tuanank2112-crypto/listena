import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LearningSessionRepository } from "./repository";

describe("LearningSessionRepository Daily Quest history", () => {
  it("returns only validated keys from the newest owned active or completed Quest states", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { stateJson: JSON.stringify({ scenarioKey: "cafe-order" }) },
      { stateJson: "not-json" },
      { stateJson: JSON.stringify({ scenarioKey: "untrusted-scenario" }) },
    ]);
    const repository = new LearningSessionRepository({
      learningSession: { findMany },
    } as never);

    await expect(repository.findRecentDailyQuestScenarioKeys("learner-1"))
      .resolves.toEqual(["cafe-order"]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "learner-1",
        mode: "DAILY_QUEST",
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { stateJson: true },
    });
  });
});
