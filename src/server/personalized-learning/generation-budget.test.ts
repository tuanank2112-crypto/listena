import { describe, expect, it } from "vitest";
import {
  evaluatePersonalizationBudget,
  PERSONALIZED_LESSON_DAILY_LIMIT,
} from "./generation-budget";

const now = new Date("2026-09-10T03:00:00.000Z");

describe("evaluatePersonalizationBudget", () => {
  it("permits a first generation", () => {
    expect(evaluatePersonalizationBudget({ now, successfulGenerationTimes: [] })).toEqual({ allowed: true });
  });

  it("blocks a concurrent active generation with a bounded retry", () => {
    const result = evaluatePersonalizationBudget({
      now,
      activeGenerationCreatedAt: new Date(now.getTime() - 10_000),
      successfulGenerationTimes: [],
    });
    expect(result).toMatchObject({ allowed: false, reason: "ACTIVE" });
    expect(result.allowed ? 0 : result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reuses no provider budget for a caller after the cooldown", () => {
    expect(evaluatePersonalizationBudget({
      now,
      successfulGenerationTimes: [new Date(now.getTime() - 5 * 60 * 1_000)],
    })).toEqual({ allowed: true });
  });

  it("caps live creations per rolling day", () => {
    const result = evaluatePersonalizationBudget({
      now,
      successfulGenerationTimes: Array.from(
        { length: PERSONALIZED_LESSON_DAILY_LIMIT },
        (_, index) => new Date(now.getTime() - (index + 1) * 60_000),
      ),
    });
    expect(result).toMatchObject({ allowed: false, reason: "DAILY_LIMIT" });
  });
});
