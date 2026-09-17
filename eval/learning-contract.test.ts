import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeDatasetHash,
  parseLearningDataset,
  validateLearningDataset,
} from "./learning-contract";

describe("learning evaluation contract", () => {
  const datasetPath = "eval/learning-cases.v1.jsonl";

  it("loads and validates the 12-case synthetic learning evaluation dataset", () => {
    const rawContent = readFileSync(datasetPath, "utf-8");
    const cases = parseLearningDataset(rawContent);

    expect(cases.length).toBeGreaterThanOrEqual(12);

    const validation = validateLearningDataset(cases);
    expect(validation.failures).toEqual([]);
    expect(validation.checks.every((c) => c.passed)).toBe(true);

    const missionCases = cases.filter((c) => c.mode === "MISSION");
    const coachCases = cases.filter((c) => c.mode === "LESSON_COACH");
    const questCases = cases.filter((c) => c.mode === "DAILY_QUEST");

    expect(missionCases.length).toBeGreaterThanOrEqual(4);
    expect(coachCases.length).toBeGreaterThanOrEqual(4);
    expect(questCases.length).toBeGreaterThanOrEqual(4);

    for (const c of cases) {
      expect(c.turns.length).toBeGreaterThanOrEqual(3);
      expect(c.synthetic).toBe(true);
      expect(c.rubricVersion).toBeTruthy();
    }
  });

  it("computes a deterministic SHA-256 hash for dataset versioning", () => {
    const hash1 = computeDatasetHash(datasetPath);
    const hash2 = computeDatasetHash(datasetPath);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);
  });
});
