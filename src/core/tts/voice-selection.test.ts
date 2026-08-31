import { describe, expect, it } from "vitest";
import { selectSystemVoice } from "./voice-selection";

const voices = [
  { name: "Google US English", voiceURI: "Google US English", lang: "en-US", default: true, localService: false },
  { name: "Microsoft Zira", voiceURI: "Microsoft Zira", lang: "en-US", default: false, localService: true },
  { name: "Microsoft Aria Online (Natural)", voiceURI: "Microsoft Aria Online (Natural)", lang: "en-US", default: false, localService: true },
  { name: "Samantha", voiceURI: "Samantha", lang: "en-US", default: false, localService: true },
];

describe("selectSystemVoice", () => {
  it("never selects Google voices", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US" });
    expect(selected?.name).not.toMatch(/google/i);
  });

  it("prefers natural system voices in high quality", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US", quality: "high" });
    expect(selected?.name).toBe("Microsoft Aria Online (Natural)");
  });

  it("uses the first matching system voice in fast mode", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US" });
    expect(selected?.name).toBe("Microsoft Zira");
  });

  it("uses an explicitly requested voice", () => {
    const selected = selectSystemVoice({ voices, lang: "en-US", preferredVoice: "Samantha" });
    expect(selected?.name).toBe("Samantha");
  });
});
