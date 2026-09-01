import { describe, expect, it } from "vitest";
import { getGameReviewRating } from "./review-rating";

describe("getGameReviewRating", () => {
  it("repeats incorrect vocabulary soon regardless of response time", () => {
    expect(getGameReviewRating(false, 1_000)).toBe("AGAIN");
  });

  it("rewards fast recall and keeps normal correct recall on schedule", () => {
    expect(getGameReviewRating(true, 5_000)).toBe("EASY");
    expect(getGameReviewRating(true, 15_000)).toBe("GOOD");
  });

  it("treats slow correct recall as hard and missing timing as good", () => {
    expect(getGameReviewRating(true, 15_001)).toBe("HARD");
    expect(getGameReviewRating(true)).toBe("GOOD");
  });
});
