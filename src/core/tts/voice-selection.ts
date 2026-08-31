export interface SelectSystemVoiceInput {
  voices: Array<Pick<SpeechSynthesisVoice, "name" | "voiceURI" | "lang" | "default" | "localService">>;
  lang: string;
  preferredVoice?: string;
  quality?: "fast" | "high";
}

function isGoogleVoice(voice: SelectSystemVoiceInput["voices"][number]) {
  return /google/i.test(voice.name) || /google/i.test(voice.voiceURI);
}

function voiceQuality(voice: SelectSystemVoiceInput["voices"][number]) {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  if (name.includes("natural")) return 4;
  if (name.includes("premium") || name.includes("enhanced")) return 3;
  if (name.includes("microsoft") || name.includes("apple")) return 2;
  return 1;
}

export function selectSystemVoice({
  voices,
  lang,
  preferredVoice,
  quality = "fast",
}: SelectSystemVoiceInput) {
  if (preferredVoice) {
    return voices.find(
      (voice) => voice.name === preferredVoice || voice.voiceURI === preferredVoice
    );
  }

  const languagePrefix = lang.split("-")[0]?.toLowerCase() ?? "";
  const matching = voices.filter((voice) => {
    if (isGoogleVoice(voice)) return false;
    return voice.lang.toLowerCase().startsWith(languagePrefix);
  });
  if (!matching.length) return undefined;

  if (quality === "high") {
    const highest = Math.max(...matching.map(voiceQuality));
    const best = matching.filter((voice) => voiceQuality(voice) === highest);
    return best.find((voice) => voice.default) ?? best[0];
  }

  return matching.find((voice) => voice.default) ?? matching[0];
}
