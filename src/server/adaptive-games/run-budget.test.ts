import { describe, expect, it } from "vitest";
import {
  evaluateGameRunRateLimit,
  GAME_RUN_MIN_INTERVAL_MS,
  GAME_RUN_ROLLING_LIMIT,
  GAME_RUN_ROLLING_WINDOW_MS,
} from "./run-budget";

const now = new Date("2026-09-10T03:00:00.000Z");

describe("evaluateGameRunRateLimit", () => {
  it("allows a learner with no fresh game run in the rolling window", () => {
    expect(evaluateGameRunRateLimit({ now, freshRunStartedAt: [] })).toEqual({ allowed: true });
  });

  it("blocks a new run during the ten-second cooldown", () => {
    const result = evaluateGameRunRateLimit({
      now,
      freshRunStartedAt: [new Date(now.getTime() - GAME_RUN_MIN_INTERVAL_MS + 1_001)],
    });

    expect(result).toEqual({
      allowed: false,
      reason: "COOLDOWN",
      retryAfterSeconds: 2,
    });
  });

  it("caps fresh game runs at twelve in a rolling 24-hour window", () => {
    const result = evaluateGameRunRateLimit({
      now,
      freshRunStartedAt: Array.from(
        { length: GAME_RUN_ROLLING_LIMIT },
        (_, index) => new Date(now.getTime() - (index + 1) * 60_000),
      ),
    });

    expect(result).toMatchObject({ allowed: false, reason: "ROLLING_LIMIT" });
    expect(result.allowed ? 0 : result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not count an exactly 24-hour-old run toward the current rolling window", () => {
    const result = evaluateGameRunRateLimit({
      now,
      freshRunStartedAt: [
        new Date(now.getTime() - GAME_RUN_ROLLING_WINDOW_MS),
        ...Array.from(
          { length: GAME_RUN_ROLLING_LIMIT - 1 },
          (_, index) => new Date(now.getTime() - (index + 1) * 60_000),
        ),
      ],
    });

    expect(result).toEqual({ allowed: true });
  });
});
