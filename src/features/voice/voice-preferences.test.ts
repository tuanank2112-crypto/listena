import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VOICE_PREFERENCES,
  getVoicePreferences,
  resetVoicePreferencesForTests,
  setPreferredBrowserVoice,
  setVoicePreferences,
  subscribeVoicePreferences,
  VOICE_PREFERENCES_STORAGE_KEY,
} from "./voice-preferences";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  };
}

beforeEach(() => resetVoicePreferencesForTests());
afterEach(() => vi.unstubAllGlobals());

describe("voice preferences", () => {
  it("returns defaults on the server and when storage is empty", () => {
    expect(getVoicePreferences()).toEqual(DEFAULT_VOICE_PREFERENCES);
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    resetVoicePreferencesForTests();
    expect(getVoicePreferences()).toEqual(DEFAULT_VOICE_PREFERENCES);
  });

  it("sanitises stored values field by field", () => {
    vi.stubGlobal("window", {
      localStorage: fakeStorage({ [VOICE_PREFERENCES_STORAGE_KEY]: JSON.stringify({ accent: "fr-FR", rate: 3, autoSpeak: false }) }),
    });
    expect(getVoicePreferences()).toEqual({ ...DEFAULT_VOICE_PREFERENCES, autoSpeak: false });
  });

  it("persists patches, notifies subscribers and survives blocked storage", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const listener = vi.fn();
    const unsubscribe = subscribeVoicePreferences(listener);
    setVoicePreferences({ accent: "en-GB", rate: 0.8 });
    expect(getVoicePreferences()).toMatchObject({ accent: "en-GB", rate: 0.8 });
    expect(JSON.parse(storage.store.get(VOICE_PREFERENCES_STORAGE_KEY) ?? "{}")).toMatchObject({ accent: "en-GB" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();

    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("blocked"); } } });
    expect(() => setVoicePreferences({ autoSpeak: false })).not.toThrow();
    expect(getVoicePreferences().autoSpeak).toBe(false);
  });
});

describe("browser voice pins (Plan18)", () => {
  it("keeps preferences written before the field existed", () => {
    vi.stubGlobal("window", {
      localStorage: fakeStorage({
        [VOICE_PREFERENCES_STORAGE_KEY]: JSON.stringify({ accent: "en-GB", rate: 0.8, autoSpeak: false }),
      }),
    });
    expect(getVoicePreferences()).toEqual({
      ...DEFAULT_VOICE_PREFERENCES,
      accent: "en-GB",
      rate: 0.8,
      autoSpeak: false,
      browserVoices: {},
    });
  });

  it("pins and clears one accent without touching the other", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    setPreferredBrowserVoice("en-US", "Microsoft Ava Online (Natural) - English (United States)");
    setPreferredBrowserVoice("en-GB", "Microsoft Sonia Online (Natural) - English (United Kingdom)");
    expect(getVoicePreferences().browserVoices).toEqual({
      "en-US": "Microsoft Ava Online (Natural) - English (United States)",
      "en-GB": "Microsoft Sonia Online (Natural) - English (United Kingdom)",
    });

    setPreferredBrowserVoice("en-US", undefined);
    expect(getVoicePreferences().browserVoices).toEqual({
      "en-GB": "Microsoft Sonia Online (Natural) - English (United Kingdom)",
    });
  });

  it("survives a patch that does not mention the pins", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    setPreferredBrowserVoice("en-US", "Ava (Premium)");
    setVoicePreferences({ rate: 1 });
    expect(getVoicePreferences().browserVoices).toEqual({ "en-US": "Ava (Premium)" });
  });

  it("drops values that are not a usable voice reference", () => {
    vi.stubGlobal("window", {
      localStorage: fakeStorage({
        [VOICE_PREFERENCES_STORAGE_KEY]: JSON.stringify({
          browserVoices: { "en-US": "   ", "en-GB": "x".repeat(201), vi: "Linh", other: 12 },
        }),
      }),
    });
    expect(getVoicePreferences().browserVoices).toEqual({});
  });

  it("does not let an ElevenLabs id sanitiser eat a browser voiceURI", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    setPreferredBrowserVoice("en-US", "com.apple.voice.premium.en-US.Ava");
    expect(getVoicePreferences().browserVoices["en-US"]).toBe("com.apple.voice.premium.en-US.Ava");
    expect(getVoicePreferences().aiVoices).toEqual({});
  });
});
