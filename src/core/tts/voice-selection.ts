import {
  chooseEnglishVoice,
  chooseVietnameseVoice,
  isExcludedVoice,
  type EnglishAccent,
} from "@/core/voice/voice-policy";

export interface SelectSystemVoiceInput {
  voices: Array<Pick<SpeechSynthesisVoice, "name" | "voiceURI" | "lang" | "default" | "localService">>;
  lang: string;
  preferredVoice?: string;
  /**
   * Kept for call-site compatibility. Since Plan14 the curated policy always
   * returns the best teaching voice; there is no separate "fast" ranking.
   */
  quality?: "fast" | "high";
}

function accentFromLang(lang: string): EnglishAccent {
  return /^en[-_]gb$/i.test(lang) ? "en-GB" : "en-US";
}

/**
 * Resolve a system voice through the curated policy (Plan14 SPEC-P140 §2).
 * An explicitly requested voice wins; otherwise English uses the accent
 * ranking, Vietnamese takes any acceptable vi-* voice, and any other language
 * falls back to the first non-novelty voice with a matching prefix.
 */
export function selectSystemVoice({ voices, lang, preferredVoice }: SelectSystemVoiceInput) {
  if (preferredVoice) {
    return voices.find(
      (voice) => voice.name === preferredVoice || voice.voiceURI === preferredVoice
    );
  }

  const prefix = lang.split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (prefix === "en") return chooseEnglishVoice(voices, accentFromLang(lang))?.voice;
  if (prefix === "vi") return chooseVietnameseVoice(voices);

  const matching = voices.filter(
    (voice) => voice.lang.toLowerCase().startsWith(prefix) && !isExcludedVoice(voice),
  );
  return matching.find((voice) => voice.default) ?? matching[0];
}
