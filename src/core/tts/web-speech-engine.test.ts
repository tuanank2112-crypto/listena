import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSpeechEngine } from "./web-speech-engine";

function voice(name: string, lang = "en-US") {
  return { name, voiceURI: name, lang, default: false, localService: true } as SpeechSynthesisVoice;
}

const AVA = voice("Microsoft Ava Online (Natural) - English (United States)");
const BRIAN = voice("Microsoft Brian Online (Natural) - English (United States)");
const ZIRA = voice("Microsoft Zira - English (United States)");
const VOICES = [ZIRA, BRIAN, AVA];

class FakeUtterance {
  voice: SpeechSynthesisVoice | undefined;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
  addEventListener() {}
  removeEventListener() {}
}

function stubSpeechSynthesis() {
  const spoken: FakeUtterance[] = [];
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("window", {
    speechSynthesis: {
      getVoices: () => VOICES,
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance);
        utterance.onend?.();
      },
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return spoken;
}

function context() {
  return { signal: new AbortController().signal, updateState: vi.fn() };
}

afterEach(() => vi.unstubAllGlobals());

describe("WebSpeechEngine voice pinning (Plan18)", () => {
  it("uses the voice the learner pinned for this accent", async () => {
    const spoken = stubSpeechSynthesis();
    const engine = new WebSpeechEngine({ getPreferredVoiceURI: () => BRIAN.voiceURI });
    await engine.speak({ text: "Hello", lang: "en" }, context());
    expect(spoken[0]?.voice).toBe(BRIAN);
  });

  it("falls back to the curated policy when the pinned voice is gone", async () => {
    const spoken = stubSpeechSynthesis();
    const engine = new WebSpeechEngine({ getPreferredVoiceURI: () => "A voice that was uninstalled" });
    await engine.speak({ text: "Hello", lang: "en" }, context());
    expect(spoken[0]?.voice).toBe(AVA);
  });

  it("lets an explicit request win over the pin", async () => {
    const spoken = stubSpeechSynthesis();
    const engine = new WebSpeechEngine({ getPreferredVoiceURI: () => BRIAN.voiceURI });
    await engine.speak({ text: "Hello", lang: "en", voice: ZIRA.voiceURI }, context());
    expect(spoken[0]?.voice).toBe(ZIRA);
  });

  it("applies a pin changed between two utterances without a reload", async () => {
    const spoken = stubSpeechSynthesis();
    let pinned: string | undefined = undefined;
    const engine = new WebSpeechEngine({ getPreferredVoiceURI: () => pinned });
    await engine.speak({ text: "One", lang: "en" }, context());
    pinned = BRIAN.voiceURI;
    await engine.speak({ text: "Two", lang: "en" }, context());
    expect(spoken[0]?.voice).toBe(AVA);
    expect(spoken[1]?.voice).toBe(BRIAN);
  });

  it("never applies an English pin to Vietnamese", async () => {
    const spoken = stubSpeechSynthesis();
    const engine = new WebSpeechEngine({ getPreferredVoiceURI: () => BRIAN.voiceURI });
    await engine.speak({ text: "Xin chào", lang: "vi" }, context());
    expect(spoken[0]?.voice).toBeUndefined();
    expect(spoken[0]?.lang).toBe("vi-VN");
  });
});
