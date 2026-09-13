import { describe, expect, it } from "vitest";
import { MissionStateSchema } from "@/server/validation/learning-session";
import {
  createMissionState,
  getMissionTemplate,
  isMissionScenarioKey,
  MISSION_TEMPLATES,
} from "@/server/ai/mission-templates";

describe("mission templates", () => {
  it("provides the three AI-first MVP scenarios", () => {
    expect(Object.keys(MISSION_TEMPLATES)).toEqual([
      "lost-luggage",
      "cafe-order",
      "mystery-clue",
    ]);
  });

  it("creates mission state accepted by the shared contract", () => {
    for (const template of Object.values(MISSION_TEMPLATES)) {
      expect(
        MissionStateSchema.safeParse(createMissionState(template)).success,
      ).toBe(true);
    }
  });

  it("uses a safe default for an unknown scenario", () => {
    expect(getMissionTemplate("not-a-real-mission").key).toBe("lost-luggage");
  });

  it.each(["toString", "constructor", "__proto__"])("rejects inherited object key %s", (key) => {
    expect(isMissionScenarioKey(key)).toBe(false);
    expect(getMissionTemplate(key).key).toBe("lost-luggage");
  });
});
