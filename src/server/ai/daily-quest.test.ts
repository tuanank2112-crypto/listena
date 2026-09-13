import { describe, expect, it } from "vitest";
import {
  planDailyQuest,
  selectDailyQuestScenario,
  selectDailyQuestScenarioDetail,
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

  it("uses a saved topic only to rank authored, non-recent scenarios", () => {
    const scenario = selectDailyQuestScenario({
      candidates: ["cafe-order", "lost-luggage", "mystery-clue"],
      preferredTopics: ["travel"],
      recentScenarioKeys: ["lost-luggage"],
      seed: "learner-42:2026-09-13",
    });

    expect(scenario).toBe("cafe-order");
  });

  it("keeps a topic-matched recent scenario ahead of an unseen unrelated one", () => {
    const scenario = selectDailyQuestScenario({
      candidates: ["lost-luggage", "mystery-clue"],
      preferredTopics: ["travel"],
      recentScenarioKeys: ["lost-luggage"],
      seed: "learner-42:2026-09-13",
    });

    expect(scenario).toBe("lost-luggage");
  });

  it("uses least-recent order before the stable tie breaker once a group is exhausted", () => {
    const scenario = selectDailyQuestScenario({
      candidates: ["cafe-order", "mystery-clue", "lost-luggage"],
      recentScenarioKeys: ["cafe-order", "mystery-clue", "lost-luggage"],
      seed: "learner-42:2026-09-13",
    });

    expect(scenario).toBe("lost-luggage");
  });

  it("does not claim a preference changed ranking when no authored option was excluded", () => {
    const selection = selectDailyQuestScenarioDetail({
      candidates: ["cafe-order"],
      preferredTopics: ["food"],
      seed: "learner-42:2026-09-13",
    });

    expect(selection).toEqual({ scenarioKey: "cafe-order", preferenceInfluenced: false });
  });

  it("falls back to a stable authored scenario when a topic has no match", () => {
    const input = {
      candidates: ["cafe-order", "lost-luggage"] as const,
      preferredTopics: ["astronomy"],
      recentScenarioKeys: [],
      seed: "learner-42:2026-09-13",
    };
    expect(selectDailyQuestScenario(input)).toBe(selectDailyQuestScenario(input));
    expect(["cafe-order", "lost-luggage"]).toContain(selectDailyQuestScenario(input));
  });
});
