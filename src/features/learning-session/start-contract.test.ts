import { describe, expect, it } from "vitest";
import {
  MAX_AUTOMATIC_START_RETRIES,
  shouldDiscardSessionStartId,
  shouldRetrySessionStart,
  startRetryDelayMs,
} from "./start-contract";

describe("session start browser contract", () => {
  it("retries an in-progress or ambiguous request with the same key at most five times", () => {
    expect(shouldRetrySessionStart({ attempt: 0, code: "START_IN_PROGRESS" })).toBe(true);
    expect(shouldRetrySessionStart({ attempt: 0, transportFailure: true })).toBe(true);
    expect(shouldRetrySessionStart({ attempt: 0, status: 503 })).toBe(true);
    expect(shouldRetrySessionStart({ attempt: MAX_AUTOMATIC_START_RETRIES, code: "START_IN_PROGRESS" })).toBe(false);
  });

  it("does not retry a known terminal result and makes the next click fresh", () => {
    expect(shouldRetrySessionStart({ attempt: 0, code: "START_OUTCOME_UNKNOWN", status: 409 })).toBe(false);
    expect(shouldDiscardSessionStartId("AI_REQUEST_LIMIT")).toBe(true);
    expect(shouldDiscardSessionStartId("START_FAILED")).toBe(true);
    expect(shouldDiscardSessionStartId("TARGET_UNAVAILABLE")).toBe(true);
    expect(shouldDiscardSessionStartId("ACTIVE_SESSION_EXISTS")).toBe(true);
    expect(shouldDiscardSessionStartId("START_OUTCOME_UNKNOWN")).toBe(false);
    expect(shouldDiscardSessionStartId("START_IN_PROGRESS")).toBe(false);
  });

  it("uses a bounded retry delay", () => {
    expect(startRetryDelayMs()).toBe(2_000);
    expect(startRetryDelayMs(0)).toBe(2_000);
    expect(startRetryDelayMs(1.2)).toBe(2_000);
    expect(startRetryDelayMs(1_000)).toBe(5_000);
  });
});
