import "server-only";

import { createHash } from "node:crypto";
import logger from "@/lib/logger";
import {
  buildCuratedCatalogue,
  type CuratedVoiceCatalogue,
  type ElevenVoiceCandidate,
} from "@/core/voice/elevenlabs-voice-policy";
import type { EnglishAccent } from "@/core/voice/voice-policy";

/**
 * ElevenLabs text-to-speech boundary (Plan15 SPEC-P150).
 *
 * The API key never leaves this module. The base URL is an in-code allowlist,
 * like the Vyce provider: configuration cannot redirect the credential. All
 * calls are bounded (text length, timeout) and typed errors tell callers
 * whether to fall back to the browser voice (unavailable) or surface a
 * configuration problem (misconfigured).
 */

const ELEVENLABS_ORIGIN = "https://api.elevenlabs.io";
export const ELEVENLABS_MAX_TEXT_CHARS = 600;
export const ELEVENLABS_TIMEOUT_MS = 20_000;
/** English: most stable production model; Vietnamese needs flash v2.5 or v3. */
export const DEFAULT_MODEL_EN = "eleven_multilingual_v2";
export const DEFAULT_MODEL_VI = "eleven_flash_v2_5";
export const DEFAULT_OUTPUT_FORMAT = "mp3_44100_64";
const CATALOGUE_TTL_MS = 60 * 60 * 1000;
const AUDIO_CACHE_LIMIT = 48;

export type ElevenLabsErrorCode = "not_configured" | "invalid_input" | "rate_limited" | "quota_exceeded" | "unauthorized" | "upstream" | "timeout";

export class ElevenLabsError extends Error {
  constructor(
    readonly code: ElevenLabsErrorCode,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`elevenlabs:${code}`);
    this.name = "ElevenLabsError";
  }
}

export interface ElevenLabsConfig {
  apiKey: string;
  modelEn: string;
  modelVi: string;
  voiceOverrides: Partial<Record<"en-US" | "en-GB" | "vi", string>>;
}

export interface ElevenLabsEnvironment {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL_EN?: string;
  ELEVENLABS_MODEL_VI?: string;
  ELEVENLABS_VOICE_EN_US?: string;
  ELEVENLABS_VOICE_EN_GB?: string;
  ELEVENLABS_VOICE_VI?: string;
}

function readEnv(): ElevenLabsEnvironment {
  return {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_MODEL_EN: process.env.ELEVENLABS_MODEL_EN,
    ELEVENLABS_MODEL_VI: process.env.ELEVENLABS_MODEL_VI,
    ELEVENLABS_VOICE_EN_US: process.env.ELEVENLABS_VOICE_EN_US,
    ELEVENLABS_VOICE_EN_GB: process.env.ELEVENLABS_VOICE_EN_GB,
    ELEVENLABS_VOICE_VI: process.env.ELEVENLABS_VOICE_VI,
  };
}

const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;

export function resolveElevenLabsConfig(env: ElevenLabsEnvironment = readEnv()): ElevenLabsConfig | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  const override = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed && VOICE_ID.test(trimmed) ? trimmed : undefined;
  };
  return {
    apiKey,
    modelEn: env.ELEVENLABS_MODEL_EN?.trim() || DEFAULT_MODEL_EN,
    modelVi: env.ELEVENLABS_MODEL_VI?.trim() || DEFAULT_MODEL_VI,
    voiceOverrides: {
      "en-US": override(env.ELEVENLABS_VOICE_EN_US),
      "en-GB": override(env.ELEVENLABS_VOICE_EN_GB),
      vi: override(env.ELEVENLABS_VOICE_VI),
    },
  };
}

export function isElevenLabsConfigured(env?: ElevenLabsEnvironment) {
  return resolveElevenLabsConfig(env) !== null;
}

type CatalogueCache = { fetchedAt: number; catalogue: CuratedVoiceCatalogue; raw: ElevenVoiceCandidate[] };
let catalogueCache: CatalogueCache | null = null;
const audioCache = new Map<string, Uint8Array>();

/** Test helper. */
export function resetElevenLabsCaches() {
  catalogueCache = null;
  audioCache.clear();
}

function mapHttpError(status: number, retryAfter: string | null): ElevenLabsError {
  const retry = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
  const retryAfterSeconds = Number.isFinite(retry) && retry > 0 ? retry : undefined;
  if (status === 401 || status === 403) return new ElevenLabsError("unauthorized", 503);
  if (status === 429) return new ElevenLabsError("rate_limited", 429, retryAfterSeconds ?? 15);
  if (status === 402) return new ElevenLabsError("quota_exceeded", 503);
  if (status === 400 || status === 422) return new ElevenLabsError("invalid_input", 400);
  return new ElevenLabsError("upstream", 502);
}

async function elevenFetch(config: ElevenLabsConfig, path: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);
  try {
    return await fetch(`${ELEVENLABS_ORIGIN}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), "xi-api-key": config.apiKey },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) throw new ElevenLabsError("timeout", 504);
    logger.warn({ code: cause instanceof Error ? cause.name : "unknown" }, "ElevenLabs request failed");
    throw new ElevenLabsError("upstream", 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The account's premade voices, ranked by the curated policy. Cached per
 * instance for an hour: the catalogue changes rarely and the listing call is
 * the only one that pays nothing.
 */
export async function getCuratedVoiceCatalogue(config: ElevenLabsConfig, now = Date.now()): Promise<CuratedVoiceCatalogue> {
  if (catalogueCache && now - catalogueCache.fetchedAt < CATALOGUE_TTL_MS) return catalogueCache.catalogue;
  const voices: ElevenVoiceCandidate[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ page_size: "100", category: "premade" });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const response = await elevenFetch(config, `/v2/voices?${params.toString()}`, { method: "GET" });
    if (!response.ok) throw mapHttpError(response.status, response.headers.get("retry-after"));
    const payload = (await response.json()) as { voices?: ElevenVoiceCandidate[]; has_more?: boolean; next_page_token?: string };
    voices.push(...(payload.voices ?? []));
    if (!payload.has_more || !payload.next_page_token) break;
    nextPageToken = payload.next_page_token;
  }
  const catalogue = buildCuratedCatalogue(voices);
  catalogueCache = { fetchedAt: now, catalogue, raw: voices };
  return catalogue;
}

export interface SynthesizeInput {
  text: string;
  lang: "en" | "vi";
  accent?: EnglishAccent;
  /** Must be a curated voice for the lang/accent, or an env override. */
  voiceId?: string;
  /** 0.7 .. 1.2, applied by the model rather than by playback rate. */
  speed?: number;
}

export interface SynthesizeOutput {
  audio: Uint8Array;
  contentType: string;
  voiceId: string;
  model: string;
  cached: boolean;
}

function clampSpeed(speed?: number) {
  if (typeof speed !== "number" || !Number.isFinite(speed)) return 1;
  return Math.round(Math.max(0.7, Math.min(1.2, speed)) * 100) / 100;
}

/** Resolve the voice for a request: explicit curated id → env override → best curated. */
export async function resolveVoiceId(config: ElevenLabsConfig, input: Pick<SynthesizeInput, "lang" | "accent" | "voiceId">) {
  const key = input.lang === "vi" ? "vi" : input.accent === "en-GB" ? "en-GB" : "en-US";
  const catalogue = await getCuratedVoiceCatalogue(config);
  const allowed = catalogue[key];
  if (input.voiceId) {
    if (allowed.some((voice) => voice.id === input.voiceId) || config.voiceOverrides[key] === input.voiceId) return input.voiceId;
    throw new ElevenLabsError("invalid_input", 400);
  }
  const override = config.voiceOverrides[key];
  if (override) return override;
  const fallbackKey = key === "vi" ? "en-US" : key === "en-GB" ? "en-US" : "en-GB";
  const choice = allowed[0] ?? catalogue[fallbackKey][0];
  if (!choice) throw new ElevenLabsError("upstream", 502);
  return choice.id;
}

export async function synthesizeSpeech(config: ElevenLabsConfig, input: SynthesizeInput): Promise<SynthesizeOutput> {
  const text = input.text.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text || text.length > ELEVENLABS_MAX_TEXT_CHARS) throw new ElevenLabsError("invalid_input", 400);
  const voiceId = await resolveVoiceId(config, input);
  const model = input.lang === "vi" ? config.modelVi : config.modelEn;
  const speed = clampSpeed(input.speed);
  const cacheKey = createHash("sha256").update(JSON.stringify({ voiceId, model, speed, lang: input.lang, text })).digest("hex");
  const cached = audioCache.get(cacheKey);
  if (cached) return { audio: cached, contentType: "audio/mpeg", voiceId, model, cached: true };

  const response = await elevenFetch(config, `/v1/text-to-speech/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      language_code: input.lang,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0, speed, use_speaker_boost: true },
      apply_text_normalization: "auto",
    }),
  });
  if (!response.ok) {
    const error = mapHttpError(response.status, response.headers.get("retry-after"));
    logger.warn({ status: response.status, code: error.code, model }, "ElevenLabs synthesis rejected");
    throw error;
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.byteLength) throw new ElevenLabsError("upstream", 502);
  if (audioCache.size >= AUDIO_CACHE_LIMIT) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(cacheKey, audio);
  return { audio, contentType: response.headers.get("content-type") ?? "audio/mpeg", voiceId, model, cached: false };
}
