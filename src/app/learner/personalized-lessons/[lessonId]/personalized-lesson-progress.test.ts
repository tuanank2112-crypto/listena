import { describe, expect, it } from "vitest";
import {
  PERSONALIZED_POLL_DEADLINE_MS,
  PERSONALIZED_POLL_INTERVAL_MS,
  progressStepIndex,
} from "./personalized-lesson-progress";

// Plan13 SPEC-P131 §4: poll every 3s for at most 210s with three visible steps.
describe("personalized lesson progress", () => {
  it("polls every 3 seconds for at most the 210 second generation lease", () => {
    expect(PERSONALIZED_POLL_INTERVAL_MS).toBe(3_000);
    expect(PERSONALIZED_POLL_DEADLINE_MS).toBe(210_000);
  });

  it("advances the visible step with elapsed time", () => {
    expect(progressStepIndex(0)).toBe(0);
    expect(progressStepIndex(4_999)).toBe(0);
    expect(progressStepIndex(5_000)).toBe(1);
    expect(progressStepIndex(39_999)).toBe(1);
    expect(progressStepIndex(40_000)).toBe(2);
    expect(progressStepIndex(200_000)).toBe(2);
  });
});
