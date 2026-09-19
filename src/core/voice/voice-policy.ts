/**
 * Curated English voice policy (Plan14 SPEC-P140 §2).
 *
 * Browser voices vary wildly in quality. A learner copying a novelty or robotic
 * voice learns the wrong pronunciation, so the policy is an explicit ranking:
 *
 *   NEURAL  > PREMIUM > SYSTEM > REMOTE
 *
 * - NEURAL: neural voices shipped with the OS/browser (Edge "Online (Natural)",
 *   Apple Premium/Enhanced/Siri voices, Android neural voices).
 * - PREMIUM: recognised high-quality named voices (Apple Samantha, Daniel, …).
 * - SYSTEM: any other regular voice from Microsoft/Apple/OS in the accent.
 * - REMOTE: Google's network voices. They are acceptable but last, because they
 *   need a network round-trip and are less expressive (ADR 0001); they remain
 *   the only English voice on many Android devices, so they are ranked, not
 *   excluded (superseded decision, Plan14).
 *
 * Novelty voices are excluded outright: they are never a pronunciation model.
 *
 * Plan18 adds one refinement inside a tier: a curated catalogue of vetted
 * voices (`browser-voice-catalog`) contributes a `listenability` score, so the
 * dozen Microsoft Natural voices on a Windows/Edge machine are no longer
 * ordered alphabetically. The score is capped below one tier step, so the
 * ranking above is untouched.
 */

import { lookupCuratedVoice, type CuratedBrowserVoice } from "./browser-voice-catalog";

export type EnglishAccent = "en-US" | "en-GB";

export type VoiceTier = "NEURAL" | "PREMIUM" | "SYSTEM" | "REMOTE";

export interface CandidateVoice {
  name: string;
  voiceURI: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

export interface VoiceChoice<V extends CandidateVoice = CandidateVoice> {
  voice: V;
  tier: VoiceTier;
  /** False when the learner asked for one accent and only another was available. */
  accentMatched: boolean;
  /** Curated catalogue entry when this voice is one we have vetted (Plan18). */
  curated?: CuratedBrowserVoice;
  /** Sort score: `TIER_RANK * 100 + listenability`. */
  quality: number;
}

export const DEFAULT_ENGLISH_ACCENT: EnglishAccent = "en-US";

export const ENGLISH_ACCENT_LABELS: Record<EnglishAccent, string> = {
  "en-US": "Giọng Mỹ (General American)",
  "en-GB": "Giọng Anh (Received Pronunciation)",
};

/** Apple/macOS novelty and legacy voices that must never model pronunciation. */
const EXCLUDED_VOICE_NAMES = new Set(
  [
    "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged", "eddy", "flo",
    "fred", "good news", "grandma", "grandpa", "hysterical", "jester", "junior", "kathy", "organ",
    "pipe organ", "ralph", "reed", "rocko", "sandy", "shelley", "superstar", "trinoids", "whisper",
    "wobble", "zarvox",
  ].map((name) => name.toLowerCase()),
);

/** Named voices known to be clear teaching voices on their platform. */
const PREMIUM_VOICE_NAMES = new Set(
  [
    "samantha", "alex", "ava", "allison", "zoe", "evan", "nathan", "joelle", "tom", "susan",
    "daniel", "kate", "serena", "oliver", "stephanie", "moira", "karen", "fiona", "tessa",
    "aria", "jenny", "guy", "michelle", "sonia", "ryan", "libby", "mia", "emma", "andrew", "brian",
  ].map((name) => name.toLowerCase()),
);

function baseName(voice: CandidateVoice) {
  return voice.name
    .replace(/\((?:enhanced|premium|natural|online|compact)\)/gi, " ")
    .replace(/\b(?:microsoft|apple|google)\b/gi, " ")
    .replace(/\b(?:online|natural|enhanced|premium|compact|desktop|mobile)\b/gi, " ")
    .replace(/[-,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRemoteVoice(voice: CandidateVoice) {
  return /google/i.test(voice.name) || /google/i.test(voice.voiceURI);
}

export function isExcludedVoice(voice: CandidateVoice) {
  const name = baseName(voice);
  if (!name) return false;
  if (EXCLUDED_VOICE_NAMES.has(name)) return true;
  return /\b(?:novelty|whisper|robot|cartoon)\b/i.test(voice.name);
}

export function classifyVoiceTier(voice: CandidateVoice): VoiceTier {
  const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  if (isRemoteVoice(voice)) return "REMOTE";
  if (/natural|neural|premium|enhanced|siri|\bx-[a-z]{3}-(?:local|network)\b/.test(haystack)) return "NEURAL";
  if (PREMIUM_VOICE_NAMES.has(baseName(voice))) return "PREMIUM";
  return "SYSTEM";
}

const TIER_RANK: Record<VoiceTier, number> = { NEURAL: 4, PREMIUM: 3, SYSTEM: 2, REMOTE: 1 };

/** One tier step. Listenability is capped below this so it can never cross a tier. */
const TIER_STEP = 100;

/**
 * Sort score for a voice (Plan18 SPEC-P180 §2). The tier decides the hundreds
 * digit, the curated listenability only orders voices inside that tier, and an
 * unknown voice simply scores the bare tier.
 */
export function voiceQualityScore(voice: CandidateVoice): number {
  const listenability = lookupCuratedVoice(voice.name)?.listenability ?? 0;
  return TIER_RANK[classifyVoiceTier(voice)] * TIER_STEP + listenability;
}

function normaliseLang(lang: string) {
  return lang.replace("_", "-").toLowerCase();
}

function accentScore(voice: CandidateVoice, accent: EnglishAccent) {
  const lang = normaliseLang(voice.lang);
  if (lang === accent.toLowerCase()) return 2;
  if (lang.startsWith("en")) return 1;
  return 0;
}

/**
 * Rank every acceptable English voice for the requested accent, best first.
 * Exact-accent voices always outrank other English accents: a learner who chose
 * British English must not hear an American neural voice merely because it is
 * "better" on paper. Within an accent the quality score decides (tier first,
 * curated listenability inside the tier), then the OS default.
 */
export function rankEnglishVoices<V extends CandidateVoice>(voices: V[], accent: EnglishAccent): Array<VoiceChoice<V>> {
  return voices
    .filter((voice) => accentScore(voice, accent) > 0 && !isExcludedVoice(voice))
    .map((voice) => {
      const curated = lookupCuratedVoice(voice.name);
      return {
        voice,
        tier: classifyVoiceTier(voice),
        accentMatched: accentScore(voice, accent) === 2,
        quality: voiceQualityScore(voice),
        ...(curated ? { curated } : {}),
      };
    })
    .sort((a, b) => {
      const accentDelta = accentScore(b.voice, accent) - accentScore(a.voice, accent);
      if (accentDelta) return accentDelta;
      const qualityDelta = b.quality - a.quality;
      if (qualityDelta) return qualityDelta;
      if (a.voice.default !== b.voice.default) return a.voice.default ? -1 : 1;
      if (a.voice.localService !== b.voice.localService) return a.voice.localService ? -1 : 1;
      return a.voice.name.localeCompare(b.voice.name);
    });
}

export function chooseEnglishVoice<V extends CandidateVoice>(voices: V[], accent: EnglishAccent): VoiceChoice<V> | undefined {
  return rankEnglishVoices(voices, accent)[0];
}

/** Vietnamese voices have no curated list; any vi-* voice that is not excluded is acceptable. */
export function chooseVietnameseVoice<V extends CandidateVoice>(voices: V[]): V | undefined {
  const matching = voices.filter((voice) => normaliseLang(voice.lang).startsWith("vi") && !isExcludedVoice(voice));
  return matching.find((voice) => voice.default) ?? matching[0];
}

export function isEnglishAccent(value: unknown): value is EnglishAccent {
  return value === "en-US" || value === "en-GB";
}
