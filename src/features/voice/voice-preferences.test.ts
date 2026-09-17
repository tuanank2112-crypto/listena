import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VOICE_PREFERENCES,
  getVoicePreferences,
  resetVoicePreferencesForTests,
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
