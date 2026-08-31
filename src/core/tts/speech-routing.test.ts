import { describe, expect, it } from "vitest";
import {
  shouldAttemptFallback,
  type SpeakResult,
  type SpeechEngine,
} from "./speech";

describe("speech fallback routing", () => {
  it("does not fallback for cancelled results", () => {
    const result: SpeakResult = { ok: false, status: "cancelled" };
    expect(shouldAttemptFallback(result)).toBe(false);
  });

  it("does fallback for failed and unavailable results", () => {
    expect(shouldAttemptFallback({ ok: false, status: "failed" })).toBe(true);
    expect(shouldAttemptFallback({ ok: false, status: "unavailable" })).toBe(true);
  });

  it("does not fallback for successful results", () => {
    expect(shouldAttemptFallback({ ok: true, status: "completed", cached: false })).toBe(false);
  });
});

describe("speech engine contract", () => {
  it("requires prepare, speak, and stop", async () => {
    const engine: SpeechEngine = {
      prepare: async () => ({ ok: true, status: "completed", cached: false }),
      speak: async () => ({ ok: true, status: "completed", cached: false }),
      stop: async () => undefined,
    };
    await expect(engine.prepare({ signal: new AbortController().signal, updateState: () => {} })).resolves.toEqual({ ok: true, status: "completed", cached: false });
    await expect(engine.speak({ text: "test", lang: "en" }, { signal: new AbortController().signal, updateState: () => {} })).resolves.toEqual({ ok: true, status: "completed", cached: false });
    await expect(engine.stop()).resolves.toBeUndefined();
  });
});
