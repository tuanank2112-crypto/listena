"use client";

import type { SpeakOptions, SpeakResult, SpeechEngine, SpeechEngineContext } from "./speech";
import { shouldAttemptFallback } from "./speech";

/**
 * Tries engines in order (Plan15): a failed or unavailable engine hands over
 * to the next one; a cancellation stops the chain. Lets one language slot
 * carry "AI voice → sidecar → browser" without changing the controller.
 */
export class CompositeSpeechEngine implements SpeechEngine {
  private active: SpeechEngine | null = null;

  constructor(private readonly engines: SpeechEngine[]) {}

  async prepare(context: SpeechEngineContext): Promise<SpeakResult> {
    for (const engine of this.engines) {
      const result = await engine.prepare(context);
      if (result.ok || result.status === "cancelled") return result;
    }
    return { ok: false, status: "unavailable" };
  }

  async speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult> {
    let last: SpeakResult = { ok: false, status: "unavailable" };
    for (const engine of this.engines) {
      if (context.signal.aborted) return { ok: false, status: "cancelled" };
      this.active = engine;
      try {
        last = await engine.speak(options, context);
      } catch (cause) {
        if (context.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
          return { ok: false, status: "cancelled" };
        }
        last = { ok: false, status: "failed", error: cause instanceof Error ? cause : new Error(String(cause)) };
      }
      if (last.ok || !shouldAttemptFallback(last)) return last;
    }
    return last;
  }

  async stop() {
    await Promise.all(this.engines.map((engine) => engine.stop()));
    this.active = null;
  }
}
