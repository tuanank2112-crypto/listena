"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_ENGLISH_ACCENT, isEnglishAccent, type EnglishAccent } from "@/core/voice/voice-policy";

export type VoiceKey = "en-US" | "en-GB" | "vi";

/** Learner-side voice preferences (Plan14 SPEC-P142 §2, Plan15 §1). Stored per browser only. */
export interface VoicePreferences {
  accent: EnglishAccent;
  /** Playback multiplier applied on top of each line's own rate. */
  rate: 0.8 | 0.92 | 1;
  /** Read every new AI turn aloud automatically. */
  autoSpeak: boolean;
  /** Include the Vietnamese coach lines when reading a turn. */
  coachVoice: boolean;
  /** "auto" uses the AI voice (ElevenLabs) when the server offers it; "browser" forces system voices. */
  engine: "auto" | "browser";
  /** Learner-chosen curated AI voice per language key; empty means the server's best pick. */
  aiVoices: Partial<Record<VoiceKey, string>>;
  /**
   * Learner-chosen browser/OS voice per English accent (Plan18 SPEC-P181).
   * Stores the `voiceURI`; a missing entry means the curated policy decides.
   * Kept apart from `aiVoices`, whose sanitiser only accepts ElevenLabs ids.
   */
  browserVoices: Partial<Record<EnglishAccent, string>>;
}

export const VOICE_PREFERENCES_STORAGE_KEY = "listena.voice.v1";

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  accent: DEFAULT_ENGLISH_ACCENT,
  rate: 0.92,
  autoSpeak: true,
  coachVoice: true,
  engine: "auto",
  aiVoices: {},
  browserVoices: {},
};

export const VOICE_RATE_OPTIONS: Array<{ value: VoicePreferences["rate"]; label: string }> = [
  { value: 0.8, label: "Chậm" },
  { value: 0.92, label: "Vừa" },
  { value: 1, label: "Tự nhiên" },
];

let current: VoicePreferences | null = null;
const listeners = new Set<() => void>();

const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;

function sanitizeVoices(value: unknown): VoicePreferences["aiVoices"] {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const output: VoicePreferences["aiVoices"] = {};
  for (const key of ["en-US", "en-GB", "vi"] as const) {
    const id = raw[key];
    if (typeof id === "string" && VOICE_ID.test(id)) output[key] = id;
  }
  return output;
}

/**
 * A browser `voiceURI` is free-form: "Microsoft Ava Online (Natural) - English
 * (United States)", "urn:moz-tts:…", "com.apple.voice.premium.en-US.Ava". Only
 * the shape is checked; a URI that no longer exists is handled at speak time.
 */
function sanitizeBrowserVoices(value: unknown): VoicePreferences["browserVoices"] {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const output: VoicePreferences["browserVoices"] = {};
  for (const key of ["en-US", "en-GB"] as const) {
    const uri = raw[key];
    if (typeof uri !== "string") continue;
    const trimmed = uri.trim();
    if (trimmed && trimmed.length <= 200) output[key] = trimmed;
  }
  return output;
}

function sanitize(value: unknown): VoicePreferences {
  if (!value || typeof value !== "object") return DEFAULT_VOICE_PREFERENCES;
  const raw = value as Record<string, unknown>;
  const rate = raw.rate === 0.8 || raw.rate === 0.92 || raw.rate === 1 ? raw.rate : DEFAULT_VOICE_PREFERENCES.rate;
  return {
    accent: isEnglishAccent(raw.accent) ? raw.accent : DEFAULT_VOICE_PREFERENCES.accent,
    rate,
    autoSpeak: typeof raw.autoSpeak === "boolean" ? raw.autoSpeak : DEFAULT_VOICE_PREFERENCES.autoSpeak,
    coachVoice: typeof raw.coachVoice === "boolean" ? raw.coachVoice : DEFAULT_VOICE_PREFERENCES.coachVoice,
    engine: raw.engine === "browser" ? "browser" : "auto",
    aiVoices: sanitizeVoices(raw.aiVoices),
    browserVoices: sanitizeBrowserVoices(raw.browserVoices),
  };
}

function load(): VoicePreferences {
  if (typeof window === "undefined") return DEFAULT_VOICE_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(VOICE_PREFERENCES_STORAGE_KEY);
    return stored ? sanitize(JSON.parse(stored)) : DEFAULT_VOICE_PREFERENCES;
  } catch {
    return DEFAULT_VOICE_PREFERENCES;
  }
}

export function getVoicePreferences(): VoicePreferences {
  if (!current) current = load();
  return current;
}

function commit(next: VoicePreferences) {
  current = next;
  try {
    window.localStorage.setItem(VOICE_PREFERENCES_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private mode or blocked storage: the in-memory value still applies for this page.
  }
  listeners.forEach((listener) => listener());
}

export function setVoicePreferences(patch: Partial<VoicePreferences>) {
  const previous = getVoicePreferences();
  commit(
    sanitize({
      ...previous,
      ...patch,
      aiVoices: { ...previous.aiVoices, ...(patch.aiVoices ?? {}) },
      browserVoices: { ...previous.browserVoices, ...(patch.browserVoices ?? {}) },
    }),
  );
}

/** Set (or clear with undefined) the chosen AI voice for one language key. */
export function setPreferredAiVoice(key: VoiceKey, voiceId: string | undefined) {
  const previous = getVoicePreferences();
  const aiVoices = { ...previous.aiVoices };
  if (voiceId) aiVoices[key] = voiceId;
  else delete aiVoices[key];
  commit(sanitize({ ...previous, aiVoices }));
}

/**
 * Pin the browser/OS voice for one English accent (Plan18 SPEC-P181).
 * `undefined` clears the pin and hands the choice back to the curated policy.
 * The other accent keeps its own pin.
 */
export function setPreferredBrowserVoice(accent: EnglishAccent, voiceURI: string | undefined) {
  const previous = getVoicePreferences();
  const browserVoices = { ...previous.browserVoices };
  if (voiceURI) browserVoices[accent] = voiceURI;
  else delete browserVoices[accent];
  commit(sanitize({ ...previous, browserVoices }));
}

export function subscribeVoicePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reset the in-memory cache; test helper. */
export function resetVoicePreferencesForTests() {
  current = null;
}

const getServerSnapshot = () => DEFAULT_VOICE_PREFERENCES;

export function useVoicePreferences() {
  return useSyncExternalStore(subscribeVoicePreferences, getVoicePreferences, getServerSnapshot);
}
