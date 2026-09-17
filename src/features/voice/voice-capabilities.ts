"use client";

import { useSyncExternalStore } from "react";
import type { CuratedElevenVoice } from "@/core/voice/elevenlabs-voice-policy";

export type PublicCuratedVoice = Pick<CuratedElevenVoice, "id" | "name" | "subtitle" | "accent" | "gender" | "tier" | "previewUrl">;

export interface VoiceCapabilities {
  status: "unknown" | "loading" | "ready" | "error";
  /** True when the server can synthesise with the AI voice (ElevenLabs configured). */
  aiVoice: boolean;
  models?: { en: string; vi: string };
  voices: { "en-US": PublicCuratedVoice[]; "en-GB": PublicCuratedVoice[]; vi: PublicCuratedVoice[] };
}

const EMPTY_VOICES: VoiceCapabilities["voices"] = { "en-US": [], "en-GB": [], vi: [] };
const INITIAL: VoiceCapabilities = { status: "unknown", aiVoice: false, voices: EMPTY_VOICES };

let current: VoiceCapabilities = INITIAL;
let inflight: Promise<VoiceCapabilities> | null = null;
const listeners = new Set<() => void>();

function publish(next: VoiceCapabilities) {
  current = next;
  listeners.forEach((listener) => listener());
}

/**
 * One capability probe per page (Plan15 SPEC-P152 §1). The AI voice engine
 * awaits this before its first request so a deployment without a key costs
 * no failed synthesis round-trip: it goes straight to the browser voice.
 */
export function loadVoiceCapabilities(): Promise<VoiceCapabilities> {
  if (current.status === "ready") return Promise.resolve(current);
  if (inflight) return inflight;
  publish({ ...current, status: "loading" });
  inflight = fetch("/api/voice/tts", { cache: "no-store" })
    .then(async (response) => {
      if (response.status === 401) return { status: "ready" as const, aiVoice: false, voices: EMPTY_VOICES };
      const payload = (await response.json().catch(() => null)) as
        | { enabled?: boolean; models?: { en: string; vi: string }; voices?: VoiceCapabilities["voices"] }
        | null;
      if (!response.ok || !payload) return { status: "error" as const, aiVoice: false, voices: EMPTY_VOICES };
      return {
        status: "ready" as const,
        aiVoice: payload.enabled === true,
        ...(payload.models ? { models: payload.models } : {}),
        voices: payload.voices ?? EMPTY_VOICES,
      };
    })
    .catch(() => ({ status: "error" as const, aiVoice: false, voices: EMPTY_VOICES }))
    .then((next) => {
      inflight = null;
      publish(next);
      return next;
    });
  return inflight;
}

export function getVoiceCapabilities() {
  return current;
}

export function subscribeVoiceCapabilities(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetVoiceCapabilitiesForTests() {
  current = INITIAL;
  inflight = null;
}

const getServerSnapshot = () => INITIAL;

export function useVoiceCapabilities() {
  return useSyncExternalStore(subscribeVoiceCapabilities, getVoiceCapabilities, getServerSnapshot);
}
