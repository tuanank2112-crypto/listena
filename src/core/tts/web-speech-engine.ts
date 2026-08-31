"use client";

import type { SpeechEngine, SpeechEngineContext, SpeakOptions, SpeakResult } from "./speech";
import { selectSystemVoice } from "./voice-selection";

/**
 * Instant system-voice engine. It uses free voices already installed with the
 * browser or operating system, so playback starts immediately without any
 * model download. Google voices are excluded because they are less expressive
 * for teaching pronunciation.
 */
export class WebSpeechEngine implements SpeechEngine {
  private audio: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceCache = new Map<string, SpeechSynthesisVoice | null>();

  async prepare(): Promise<SpeakResult> {
    this.refreshVoices();
    return { ok: true, status: "completed", cached: false };
  }

  async speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult> {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      throw new Error("Web Speech API không khả dụng");
    }

    context.updateState({ phase: "synthesizing", downloadProgress: null, error: null });

    return new Promise<SpeakResult>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(options.text);
      const lang = options.lang === "vi" ? "vi-VN" : "en-GB";
      utterance.lang = lang;
      const voice = this.selectVoice(options.voice, lang, options.quality);
      if (voice) utterance.voice = voice;
      utterance.rate = Math.max(0.25, Math.min(2, options.speed ?? 1));
      this.audio = utterance;

      const cleanup = () => {
        this.audio = null;
        context.signal.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        window.speechSynthesis.cancel();
        cleanup();
        reject(new DOMException("Đã hủy phát âm thanh", "AbortError"));
      };

      context.signal.addEventListener("abort", onAbort, { once: true });

      const onPlay = () => context.updateState({ phase: "playing", downloadProgress: null });
      utterance.addEventListener("play", onPlay, { once: true });
      utterance.onend = () => {
        cleanup();
        resolve({ ok: true, status: "completed", cached: false });
      };
      utterance.onerror = () => {
        cleanup();
        reject(new Error("Không thể phát audio Web Speech"));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async stop(): Promise<void> {
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    this.audio = null;
  }

  private refreshVoices() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) this.voices = voices;
  }

  private selectVoice(preferredVoice: string | undefined, lang: string, quality: SpeakOptions["quality"]) {
    this.refreshVoices();
    if (!this.voices.length) {
      window.speechSynthesis.addEventListener("voiceschanged", () => this.refreshVoices(), { once: true });
      return undefined;
    }

    const exact = preferredVoice
      ? this.voices.find((voice) => voice.name === preferredVoice || voice.voiceURI === preferredVoice)
      : undefined;
    if (exact) return exact;

    const cacheKey = `${lang}:${preferredVoice ?? ""}`;
    if (this.voiceCache.has(cacheKey)) return this.voiceCache.get(cacheKey) ?? undefined;

    const selected = selectSystemVoice({
      voices: this.voices,
      lang,
      preferredVoice,
      quality,
    });
    this.voiceCache.set(cacheKey, selected ?? null);
    return selected;
  }
}
