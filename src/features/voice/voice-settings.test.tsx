import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { rankEnglishVoices } from "@/core/voice/voice-policy";
import { VoiceSettings, buildBrowserVoiceOptions } from "./voice-settings";

vi.mock("@/core/tts/speech", () => ({
  speakCurated: vi.fn(),
  speakWithBrowserVoice: vi.fn(),
  stopSpeech: vi.fn(),
}));

function voice(name: string, lang = "en-US") {
  return { name, voiceURI: name, lang, default: false, localService: true } as SpeechSynthesisVoice;
}

const windowsEdge = [
  voice("Microsoft Ava Online (Natural) - English (United States)"),
  voice("Microsoft Emma Online (Natural) - English (United States)"),
  voice("Microsoft Andrew Online (Natural) - English (United States)"),
  voice("Microsoft Aria Online (Natural) - English (United States)"),
  voice("Microsoft Jenny Online (Natural) - English (United States)"),
  voice("Microsoft Michelle Online (Natural) - English (United States)"),
  voice("Microsoft Guy Online (Natural) - English (United States)"),
  voice("Microsoft Zira - English (United States)"),
];

describe("buildBrowserVoiceOptions", () => {
  const ranked = rankEnglishVoices(windowsEdge, "en-US");

  it("trims the list to six rows on a device full of voices", () => {
    const options = buildBrowserVoiceOptions(ranked, undefined, true);
    expect(options.shown).toHaveLength(6);
    expect(options.auto?.curated?.key).toBe("ava");
    expect(options.pinnedChoice).toBeUndefined();
    expect(options.pinnedMissing).toBe(false);
  });

  it("keeps a pinned voice visible even when it ranks below the cut", () => {
    const pinned = "Microsoft Zira - English (United States)";
    const options = buildBrowserVoiceOptions(ranked, pinned, true);
    expect(options.shown).toHaveLength(7);
    expect(options.shown.at(-1)?.voice.name).toBe(pinned);
    expect(options.pinnedChoice?.voice.name).toBe(pinned);
    expect(options.pinnedMissing).toBe(false);
  });

  it("reports a pin that is no longer installed instead of dropping it silently", () => {
    const options = buildBrowserVoiceOptions(ranked, "Some Uninstalled Voice", true);
    expect(options.pinnedChoice).toBeUndefined();
    expect(options.pinnedMissing).toBe(true);
    expect(options.auto?.curated?.key).toBe("ava");
  });

  it("does not claim a pin is missing while the voice list is still empty", () => {
    expect(buildBrowserVoiceOptions([], "Ava (Premium)", false).pinnedMissing).toBe(false);
  });
});

describe("VoiceSettings (static render)", () => {
  it("shows the device voice picker in its loading state without claiming there are no voices", () => {
    const html = renderToStaticMarkup(<VoiceSettings />);
    expect(html).toContain("Giọng tiếng Anh trên thiết bị này");
    expect(html).toContain("Đang tải danh sách giọng");
    // SSR must not decide the device has no voices (SPEC-P181 U4).
    expect(html).not.toContain("Trình duyệt này không có giọng đọc");
  });
});
