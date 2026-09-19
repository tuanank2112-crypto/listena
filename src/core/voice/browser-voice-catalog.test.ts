import { describe, expect, it } from "vitest";
import {
  CURATED_BROWSER_VOICES,
  MAX_LISTENABILITY,
  lookupCuratedVoice,
  normaliseVoiceName,
} from "./browser-voice-catalog";
import { isExcludedVoice } from "./voice-policy";

describe("normaliseVoiceName", () => {
  // The table pinned in Plan18 SPEC-P180 §3.
  it.each([
    ["Microsoft Ava Online (Natural) - English (United States)", "ava"],
    ["Microsoft Ava (Natural) - English (United States)", "ava"],
    ["Ava (Premium)", "ava"],
    ["Microsoft Sonia Online (Natural) - English (United Kingdom)", "sonia"],
    ["Google UK English Female", "google uk english female"],
    ["Microsoft Zira Desktop - English (United States)", "zira"],
    ["Siri Voice 1 (American English)", "siri 1"],
    ["", ""],
  ])("maps %j to %j", (raw, expected) => {
    expect(normaliseVoiceName(raw)).toBe(expected);
  });

  it("strips the Multilingual suffix Edge glues onto the name", () => {
    expect(normaliseVoiceName("Microsoft AvaMultilingual Online (Natural) - English (United States)")).toBe("ava");
    expect(normaliseVoiceName("Microsoft AndrewMultilingual Online (Natural) - English (United States)")).toBe("andrew");
  });

  it("never throws on junk input", () => {
    expect(normaliseVoiceName("   ")).toBe("");
    expect(normaliseVoiceName("???")).toBe("");
    expect(normaliseVoiceName(undefined as unknown as string)).toBe("");
  });
});

describe("lookupCuratedVoice", () => {
  it("finds the same entry across platforms", () => {
    const edge = lookupCuratedVoice("Microsoft Ava Online (Natural) - English (United States)");
    const apple = lookupCuratedVoice("Ava (Premium)");
    expect(edge?.key).toBe("ava");
    expect(apple).toBe(edge);
  });

  it("finds Google and legacy SAPI voices", () => {
    expect(lookupCuratedVoice("Google UK English Male")?.platform).toBe("Google");
    expect(lookupCuratedVoice("Microsoft David Desktop - English (United States)")?.platform).toBe("Microsoft (cũ)");
  });

  it("resolves Siri aliases to one entry", () => {
    const first = lookupCuratedVoice("Siri Voice 1 (American English)");
    expect(lookupCuratedVoice("Siri Voice 4 (American English)")).toBe(first);
    expect(first?.label).toBe("Siri");
  });

  it("finds the voices added on 2026-09-19 by user request", () => {
    expect(lookupCuratedVoice("Microsoft Christopher Online (Natural) - English (United States)")?.key).toBe("christopher");
    expect(lookupCuratedVoice("Microsoft Eric Online (Natural) - English (United States)")?.key).toBe("eric");
    expect(lookupCuratedVoice("Microsoft Ana Online (Natural) - English (United States)")?.listenability).toBe(50);
    expect(lookupCuratedVoice("Alex")?.platform).toBe("Apple");
    expect(lookupCuratedVoice("Nicky (Enhanced)")?.key).toBe("nicky");
    expect(lookupCuratedVoice("Aaron")?.key).toBe("aaron");
    expect(lookupCuratedVoice("Arthur (Premium)")?.accent).toBe("en-GB");
  });

  it("returns undefined for a voice we have not vetted", () => {
    expect(lookupCuratedVoice("Microsoft Natasha Online (Natural) - English (Australia)")).toBeUndefined();
  });
});

describe("catalogue integrity", () => {
  it("has unique keys and aliases", () => {
    const seen = new Set<string>();
    for (const entry of CURATED_BROWSER_VOICES) {
      for (const name of [entry.key, ...(entry.aliases ?? [])]) {
        expect(seen.has(name), `duplicate catalogue name: ${name}`).toBe(false);
        seen.add(name);
      }
    }
  });

  it("keeps every score below one tier step", () => {
    for (const entry of CURATED_BROWSER_VOICES) {
      expect(entry.listenability).toBeGreaterThanOrEqual(0);
      expect(entry.listenability).toBeLessThanOrEqual(MAX_LISTENABILITY);
    }
  });

  it("stores keys that are already normalised", () => {
    for (const entry of CURATED_BROWSER_VOICES) {
      expect(normaliseVoiceName(entry.key)).toBe(entry.key);
    }
  });

  it("never lists a novelty voice", () => {
    for (const entry of CURATED_BROWSER_VOICES) {
      const candidate = { name: entry.label, voiceURI: entry.key, lang: entry.accent, default: false, localService: true };
      expect(isExcludedVoice(candidate), `${entry.label} is excluded as novelty`).toBe(false);
    }
  });
});
