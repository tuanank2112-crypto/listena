import { describe, expect, it } from "vitest";
import {
  applySkillMasteryUpdate,
  skillMasteryAlpha,
  skillMasteryPerformance,
} from "./skill-mastery";

describe("applySkillMasteryUpdate (Plan13 §8 unified formula)", () => {
  it("uses alpha 0.18 for games and 0.2 for personalized lessons", () => {
    expect(skillMasteryAlpha("game")).toBe(0.18);
    expect(skillMasteryAlpha("personalized")).toBe(0.2);
    expect(applySkillMasteryUpdate({ old: 0.5, score: 1, difficulty: 1, source: "game" })).toBeCloseTo(0.59, 10);
    expect(applySkillMasteryUpdate({ old: 0.5, score: 1, difficulty: 1, source: "personalized" })).toBeCloseTo(0.6, 10);
  });

  it("clamps difficulty into [0.6, 1.8] before scaling the score", () => {
    // difficulty 0.3 is clamped to 0.6 -> performance = min(1, 0.5 / 0.6)
    expect(skillMasteryPerformance(0.5, 0.3)).toBeCloseTo(0.5 / 0.6, 10);
    // difficulty 5 is clamped to 1.8 -> 1 / 1.8
    expect(skillMasteryPerformance(1, 5)).toBeCloseTo(1 / 1.8, 10);
    // a perfect answer on an easy item never exceeds 1
    expect(skillMasteryPerformance(1, 0.6)).toBe(1);
  });

  it("moves mastery down on a zero score and never leaves [0, 1]", () => {
    expect(applySkillMasteryUpdate({ old: 0.5, score: 0, difficulty: 1, source: "game" })).toBeCloseTo(0.41, 10);
    expect(applySkillMasteryUpdate({ old: 0, score: 0, difficulty: 1, source: "game" })).toBe(0);
    expect(applySkillMasteryUpdate({ old: 1, score: 1, difficulty: 0.6, source: "personalized" })).toBe(1);
    expect(applySkillMasteryUpdate({ old: 2, score: 1, difficulty: 1, source: "game" })).toBe(1);
    expect(applySkillMasteryUpdate({ old: Number.NaN, score: 1, difficulty: 1, source: "game" })).toBeCloseTo(0.18, 10);
  });

  it("matches the SQL mirror shape old + alpha * (performance - old)", () => {
    const old = 0.37;
    const performance = skillMasteryPerformance(0.8, 1.2);
    expect(applySkillMasteryUpdate({ old, score: 0.8, difficulty: 1.2, source: "game" }))
      .toBeCloseTo(old + 0.18 * (performance - old), 12);
  });
});
