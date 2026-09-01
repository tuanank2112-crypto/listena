import { describe, expect, it } from "vitest";
import {
  planDailyQuest,
  type DailyQuestPlanInput,
} from "@/server/ai/daily-quest";

describe("daily quest planner", () => {
  it("focuses on the weakest skill and avoids a recent scenario", () => {
    const input: DailyQuestPlanInput = {
      learnerKey: "learner-42",
      dateKey: "2026-09-02",
      skillMastery: {
        communication: 0.2,
        vocabulary: 0.8,
        grammar: 0.7,
      },
      dueVocabulary: ["bill", "sandwich", "bill"],
      recentScenarioKeys: ["cafe-order"],
    };

    const plan = planDailyQuest(input);
    expect(plan.focusSkill).toBe("communication");
    expect(plan.scenarioKey).not.toBe("cafe-order");
    expect(plan.targetVocabulary.slice(0, 2)).toEqual(["bill", "sandwich"]);
    expect(planDailyQuest(input)).toEqual(plan);
  });
});
