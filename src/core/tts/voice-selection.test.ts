import { describe, expect, it } from "vitest";
import { selectSystemVoice } from "./voice-selection";

const voices = [
  { name: "Google US English", voiceURI: "Google US English", lang: "en-US", default: true, localService: false },
  { name: "Microsoft Zira", voiceURI: "Microsoft Zira", lang: "en-US", default: false, localService: true },
  { name: "Microsoft Aria Online (Natural)", voiceURI: "Microsoft Aria Online (Natural)", lang: "en-US", default: false, localService: true },
  { name: "Samantha", voiceURI: "Samantha", lang: "en-US", default: false, localService: true },
  { name: "Daniel", voiceURI: "Daniel", lang: "en-GB", default: false, localService: true },
  { name: "Zarvox", voiceURI: "Zarvox", lang: "en-US", default: false, localService: true },
  { name: "Linh", voiceURI: "Linh", lang: "vi-VN", default: false, localService: true },
];

describe("selectSystemVoice", () => {
  it("does not select the Google default while a curated system voice exists", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US" });
    expect(selected?.name).not.toMatch(/google/i);
  });

  it("always prefers the neural voice, in fast and high quality alike", () => {
    expect(selectSystemVoice({ voices, lang: "en-US", quality: "high" })?.name).toBe("Microsoft Aria Online (Natural)");
    expect(selectSystemVoice({ voices, lang: "en-US", quality: "fast" })?.name).toBe("Microsoft Aria Online (Natural)");
  });

  it("honours the requested accent", () => {
    expect(selectSystemVoice({ voices, lang: "en-GB" })?.name).toBe("Daniel");
  });

  it("uses an explicitly requested voice", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US", preferredVoice: "Samantha" });
    expect(selected?.name).toBe("Samantha");
  });

  it("falls back to the Google voice when it is the only English voice (Android)", () => {
    const androidOnly = voices.filter((voice) => /google/i.test(voice.name));
    expect(selectSystemVoice({ voices: androidOnly, lang: "en-US" })?.name).toBe("Google US English");
  });

  it("never picks a novelty voice and resolves Vietnamese voices", () => {
    expect(selectSystemVoice({ voices: [voices[5]], lang: "en-US" })).toBeUndefined();
    expect(selectSystemVoice({ voices, lang: "vi-VN" })?.name).toBe("Linh");
  });
});
