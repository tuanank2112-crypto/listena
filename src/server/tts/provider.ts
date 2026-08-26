/**
 * TTS (Text-to-Speech) Provider interface.
 * @deprecated Giữ lại tương thích lịch sử; Kokoro là nguồn giọng tiếng Anh duy nhất của ứng dụng.
 * MockTTS returns metadata for client-side speech synthesis.
 * OpenAI TTS provides real audio.
 */

import logger from "@/lib/logger";

export interface TTSConfig {
  provider: "mock" | "openai";
  apiKey?: string;
  voice?: string;
}

export interface TTSResult {
  audioUrl: string | null;
  audioData: ArrayBuffer | null;
  metadata: {
    provider: string;
    voice: string;
    duration: number;
  };
}

export interface TTSProvider {
  synthesize(text: string, options?: { voice?: string; speed?: number }): Promise<TTSResult>;
}

// ── Mock TTS Provider ────────────────────────────────

export class MockTTSProvider implements TTSProvider {
  async synthesize(
    _text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<TTSResult> {
    logger.info(
      { provider: "mock", voice: options?.voice, speed: options?.speed },
      "Mock TTS synthesis"
    );
    return {
      audioUrl: null,
      audioData: null,
      metadata: {
        provider: "mock",
        voice: options?.voice ?? "default",
        duration: 0,
      },
    };
  }
}

// ── OpenAI TTS Provider ──────────────────────────────

export class OpenAITTSProvider implements TTSProvider {
  private apiKey: string;
  private defaultVoice: string;

  constructor(config: { apiKey: string; voice?: string }) {
    this.apiKey = config.apiKey;
    this.defaultVoice = config.voice ?? "alloy";
  }

  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<TTSResult> {
    const voice = options?.voice ?? this.defaultVoice;
    const speed = options?.speed ?? 1.0;

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        speed,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, "OpenAI TTS API call failed");
      throw new Error(`TTS API error: ${response.status}`);
    }

    const audioData = await response.arrayBuffer();

    return {
      audioUrl: null,
      audioData,
      metadata: {
        provider: "openai",
        voice,
        duration: 0,
      },
    };
  }
}

// ── Factory ──────────────────────────────────────────

export function createTTSProvider(config: TTSConfig): TTSProvider {
  if (config.provider === "openai" && config.apiKey) {
    logger.info({ provider: "openai", voice: config.voice }, "Using OpenAI TTS provider");
    return new OpenAITTSProvider({
      apiKey: config.apiKey,
      voice: config.voice,
    });
  }
  logger.info({ provider: "mock" }, "Using Mock TTS provider");
  return new MockTTSProvider();
}
