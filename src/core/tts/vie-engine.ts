"use client";

import { createTTSCacheKey, resolveTTSCacheKeyInput } from "./cache-key";
import type { SpeakOptions, SpeakResult, SpeechEngine, SpeechEngineContext } from "./speech";

/**
 * VieNeuSpeechEngine — gọi Next.js API route /api/tts/vie (proxy nội bộ).
 * Sidecar VieNeu chạy riêng trên VIENEU_URL; route này cache trên đĩa và
 * trả header immutable để browser dùng lại audio cũ.
 */

const ENGINE_VERSION = "vieneu-3.3.0";

const VIENEU_DEFAULT_VOICE = process.env.NEXT_PUBLIC_VIENEU_DEFAULT_VOICE ?? "";

async function fetchVieneuAudio(
  text: string,
  voice: string | undefined,
  speed: number,
): Promise<ArrayBuffer> {
  const response = await fetch("/api/tts/vie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voice || undefined, speed }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`VieNeu TTS failed with status ${response.status}`);
  return response.arrayBuffer();
}

export class VieNeuSpeechEngine implements SpeechEngine {
  private audio: HTMLAudioElement | null = null;

  async prepare(_context: SpeechEngineContext): Promise<SpeakResult> {
    return { ok: true, status: "completed", cached: false };
  }

  async speak(options: SpeakOptions, context: SpeechEngineContext): Promise<SpeakResult> {
    const voice = options.voice || VIENEU_DEFAULT_VOICE;
    const resolved = resolveTTSCacheKeyInput(
      { text: options.text, engineVersion: ENGINE_VERSION, speed: options.speed },
      voice
    );

    context.updateState({ phase: "synthesizing", error: null });
    const buffer = await fetchVieneuAudio(resolved.text, resolved.voice, resolved.speed ?? 1);
    if (!buffer || !buffer.byteLength) throw new Error("VieNeu không trả audio");

    // Phát audio trực tiếp từ ArrayBuffer trả về (audio đã cache ở server)
    await this.play(buffer, context);
    return { ok: true, status: "completed", cached: false };
  }

  async stop() {
    this.audio?.pause();
    this.audio = null;
  }

  private play(wav: ArrayBuffer, context: SpeechEngineContext) {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const audio = new Audio(url);
      this.audio = audio;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
      };
      context.signal.addEventListener(
        "abort",
        () => {
          audio.pause();
          cleanup();
          reject(new DOMException("Đã hủy phát âm thanh", "AbortError"));
        },
        { once: true }
      );
      audio.onplay = () => context.updateState({ phase: "playing", downloadProgress: null });
      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("Không thể phát audio VieNeu")); };
      void audio.play().catch((error) => { cleanup(); reject(error); });
    });
  }
}
