import { describe, expect, it, vi } from "vitest";
import { CompositeSpeechEngine } from "./composite-engine";
import type { SpeechEngine } from "./speech";

function engine(result: Awaited<ReturnType<SpeechEngine["speak"]>> | Error): SpeechEngine {
  return {
    prepare: vi.fn().mockResolvedValue({ ok: true, status: "completed", cached: false }),
    speak: result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result),
    stop: vi.fn(),
  };
}

const context = () => ({ signal: new AbortController().signal, updateState: () => {} });

describe("CompositeSpeechEngine", () => {
  it("returns the first successful engine without touching the rest", async () => {
    const first = engine({ ok: true, status: "completed", cached: false });
    const second = engine({ ok: true, status: "completed", cached: false });
    const result = await new CompositeSpeechEngine([first, second]).speak({ text: "Hi", lang: "en" }, context());
    expect(result.ok).toBe(true);
    expect(second.speak).not.toHaveBeenCalled();
  });

  it("falls through unavailable and thrown failures to the next engine", async () => {
    const unavailable = engine({ ok: false, status: "unavailable" });
    const throwing = engine(new Error("503"));
    const browser = engine({ ok: true, status: "completed", cached: false });
    const result = await new CompositeSpeechEngine([unavailable, throwing, browser]).speak({ text: "Hi", lang: "en" }, context());
    expect(result.ok).toBe(true);
    expect(browser.speak).toHaveBeenCalledTimes(1);
  });

  it("stops the chain on cancellation", async () => {
    const cancelled = engine({ ok: false, status: "cancelled" });
    const browser = engine({ ok: true, status: "completed", cached: false });
    const result = await new CompositeSpeechEngine([cancelled, browser]).speak({ text: "Hi", lang: "en" }, context());
    expect(result).toEqual({ ok: false, status: "cancelled" });
    expect(browser.speak).not.toHaveBeenCalled();
  });

  it("reports unavailable when every engine is unavailable and stops all engines", async () => {
    const a = engine({ ok: false, status: "unavailable" });
    const b = engine({ ok: false, status: "failed" });
    const composite = new CompositeSpeechEngine([a, b]);
    await expect(composite.speak({ text: "Hi", lang: "en" }, context())).resolves.toMatchObject({ ok: false, status: "failed" });
    await composite.stop();
    expect(a.stop).toHaveBeenCalled();
    expect(b.stop).toHaveBeenCalled();
  });
});
