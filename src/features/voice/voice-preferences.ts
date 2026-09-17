"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_ENGLISH_ACCENT, isEnglishAccent, type EnglishAccent } from "@/core/voice/voice-policy";

/** Learner-side voice preferences (Plan14 SPEC-P142 §2). Stored per browser only. */
export interface VoicePreferences {
  accent: EnglishAccent;
  /** Playback multiplier applied on top of each line's own rate. */
  rate: 0.8 | 0.92 | 1;
  /** Read every new AI turn aloud automatically. */
  autoSpeak: boolean;
  /** Include the Vietnamese coach lines when reading a turn. */
  coachVoice: boolean;
}

export const VOICE_PREFERENCES_STORAGE_KEY = "listena.voice.v1";

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  accent: DEFAULT_ENGLISH_ACCENT,
  rate: 0.92,
  autoSpeak: true,
  coachVoice: true,
};

export const VOICE_RATE_OPTIONS: Array<{ value: VoicePreferences["rate"]; label: string }> = [
  { value: 0.8, label: "Chậm" },
  { value: 0.92, label: "Vừa" },
  { value: 1, label: "Tự nhiên" },
];

let current: VoicePreferences | null = null;
const listeners = new Set<() => void>();

function sanitize(value: unknown): VoicePreferences {
  if (!value || typeof value !== "object") return DEFAULT_VOICE_PREFERENCES;
  const raw = value as Record<string, unknown>;
  const rate = raw.rate === 0.8 || raw.rate === 0.92 || raw.rate === 1 ? raw.rate : DEFAULT_VOICE_PREFERENCES.rate;
  return {
    accent: isEnglishAccent(raw.accent) ? raw.accent : DEFAULT_VOICE_PREFERENCES.accent,
    rate,
    autoSpeak: typeof raw.autoSpeak === "boolean" ? raw.autoSpeak : DEFAULT_VOICE_PREFERENCES.autoSpeak,
    coachVoice: typeof raw.coachVoice === "boolean" ? raw.coachVoice : DEFAULT_VOICE_PREFERENCES.coachVoice,
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

export function setVoicePreferences(patch: Partial<VoicePreferences>) {
  current = sanitize({ ...getVoicePreferences(), ...patch });
  try {
    window.localStorage.setItem(VOICE_PREFERENCES_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private mode or blocked storage: the in-memory value still applies for this page.
  }
  listeners.forEach((listener) => listener());
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
