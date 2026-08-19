import { describe, expect, it } from "vitest";
import { assessOpenResponse } from "./engine";

describe("assessOpenResponse", () => {
  it("scores completion without comparing against a model answer", () => {
    const result = assessOpenResponse("I visited Da Nang last summer. The beach was beautiful.");
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(result.errors).toHaveLength(0);
  });

  it("gives short answers a lower completion score", () => {
    const shortAnswer = assessOpenResponse("Yes");
    const completeAnswer = assessOpenResponse("Yes, I enjoyed the trip because the weather was sunny.");
    expect(shortAnswer.overallScore).toBeLessThan(completeAnswer.overallScore);
  });
});
