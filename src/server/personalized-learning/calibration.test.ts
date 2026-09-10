import { describe, expect, it } from "vitest";
import {
  assessCalibration,
  difficultyFromMastery,
} from "@/server/personalized-learning/calibration";

describe("personalized-learning calibration", () => {
  it("does not certify or shift a CEFR level from a single answer", () => {
    expect(
      assessCalibration({
        currentLevel: "A2",
        existingStatus: "UNASSESSED",
        evidence: [{ skillKey: "vocabulary", score: 1, confidence: 1 }],
      }),
    ).toMatchObject({ status: "UNASSESSED", nextLevel: "A2" });
  });

  it("moves only after broad, high-confidence evidence crosses the final threshold", () => {
    const evidence = Array.from({ length: 12 }, (_, index) => ({
      skillKey: index % 2 ? "vocabulary" : "spelling",
      score: 0.9,
      confidence: 0.9,
    }));
    expect(
      assessCalibration({
        currentLevel: "A2",
        existingStatus: "CALIBRATING",
        evidence,
      }),
    ).toMatchObject({ status: "CALIBRATED", nextLevel: "B1" });
  });

  it("creates a wider difficulty band for stronger evidence without leaving bounds", () => {
    expect(difficultyFromMastery(0)).toBeLessThan(difficultyFromMastery(1));
    expect(difficultyFromMastery(-3)).toBe(difficultyFromMastery(0));
    expect(difficultyFromMastery(3)).toBe(difficultyFromMastery(1));
  });
});
