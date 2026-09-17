"use client";

import type { SpeakOptions, SpeakResult, SpeechEngine, SpeechEngineContext } from "./speech";
import type { EnglishAccent } from "@/core/voice/voice-policy";

export interface ElevenLabsEngineOptions {
  /** Resolves once with whether the server can synthesise; false short-circuits to "unavailable". */
  isAvailable: () => Promise<boolean>;
  getAccent: () => EnglishAccent;
  /** Learner-chosen curated voice per language key, if any. */
  getVoiceId: (key: "en-US" | "en-GB" | "vi") => string | undefined;
}

const CLIENT_CACHE_LIMIT = 40;

/**
 * AI voice engine (Plan15): asks our own `/api/voice/tts` for audio and plays
 * it. The browser never talks to ElevenLabs. Failures return `unavailable`
 * or throw, and the speech controller/composite falls back to the browser
 * voice, so a missing key or a quota error never silences the app.
 */
export class ElevenLabsSpeechEngine implements SpeechEngine {
  private audio: HTMLAudioElement | null = null;
  private readonly cache = new Map<string, Blob>();

  constructor(private readonly options: ElevenLabsEngineOptions) {}

  async prepare(): Promise<SpeakResult> {
    return (await this.options.isAvailable()) ? { ok: true, status: "completed", cached: false } : { ok: false, status: "unavailable" };
  }

  async speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult> {
    if (!(await this.options.isAvailable())) return { ok: false, status: "unavailable" };
    if (context.signal.aborted) return { ok: false, status: "cancelled" };
    const key = options.lang === "vi" ? "vi" : this.options.getAccent();
    const voiceId = options.voice || this.options.getVoiceId(key);
    const speed = Math.max(0.7, Math.min(1.2, options.speed ?? 1));
    const cacheKey = JSON.stringify({ text: options.text, lang: options.lang, key, voiceId: voiceId ?? "", speed });

    context.updateState({ phase: "synthesizing", downloadProgress: null, error: null });
    let blob = this.cache.get(cacheKey);
    let cached = Boolean(blob);
    if (!blob) {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: options.text,
          lang: options.lang,
          ...(options.lang === "en" ? { accent: key } : {}),
          ...(voiceId ? { voiceId } : {}),
          speed,
        }),
        cache: "no-store",
        signal: context.signal,
      });
      if (response.status === 503 || response.status === 502 || response.status === 504 || response.status === 429) {
        return { ok: false, status: "unavailable", engine: "elevenlabs" };
      }
      if (!response.ok) throw new Error(`AI voice failed with status ${response.status}`);
      blob = await response.blob();
      if (!blob.size) throw new Error("AI voice returned no audio");
      cached = false;
      if (this.cache.size >= CLIENT_CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(cacheKey, blob);
    }
    if (context.signal.aborted) return { ok: false, status: "cancelled" };
    await this.play(blob, context);
    return { ok: true, status: "completed", cached, engine: "elevenlabs" };
  }

  async stop() {
    this.audio?.pause();
    this.audio = null;
  }

  private play(blob: Blob, context: SpeechEngineContext) {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.audio = audio;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        context.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        audio.pause();
        cleanup();
        reject(new DOMException("Đã hủy phát âm thanh", "AbortError"));
      };
      context.signal.addEventListener("abort", onAbort, { once: true });
      audio.onplay = () => context.updateState({ phase: "playing", downloadProgress: null });
      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("Không thể phát audio giọng AI")); };
      void audio.play().catch((error) => { cleanup(); reject(error); });
    });
  }
}
