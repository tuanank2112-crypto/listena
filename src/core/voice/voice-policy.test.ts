import { describe, expect, it } from "vitest";
import {
  chooseEnglishVoice,
  chooseVietnameseVoice,
  classifyVoiceTier,
  isExcludedVoice,
  rankEnglishVoices,
} from "./voice-policy";

function voice(name: string, lang: string, extra: Partial<{ default: boolean; localService: boolean; voiceURI: string }> = {}) {
  return { name, voiceURI: extra.voiceURI ?? name, lang, default: extra.default ?? false, localService: extra.localService ?? true };
}

const desktop = [
  voice("Google US English", "en-US", { default: true, localService: false }),
  voice("Microsoft Zira - English (United States)", "en-US"),
  voice("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
  voice("Samantha", "en-US"),
  voice("Daniel", "en-GB"),
  voice("Bad News", "en-US"),
  voice("Zarvox", "en-US"),
  voice("Linh", "vi-VN"),
];

describe("voice tiers", () => {
  it("classifies neural, premium, system and remote voices", () => {
    expect(classifyVoiceTier(voice("Microsoft Aria Online (Natural)", "en-US"))).toBe("NEURAL");
    expect(classifyVoiceTier(voice("Samantha (Enhanced)", "en-US"))).toBe("NEURAL");
    expect(classifyVoiceTier(voice("Samantha", "en-US"))).toBe("PREMIUM");
    expect(classifyVoiceTier(voice("Microsoft Zira", "en-US"))).toBe("SYSTEM");
    expect(classifyVoiceTier(voice("Google US English", "en-US"))).toBe("REMOTE");
  });

  it("excludes novelty voices that would model bad pronunciation", () => {
    expect(isExcludedVoice(voice("Bad News", "en-US"))).toBe(true);
    expect(isExcludedVoice(voice("Zarvox", "en-US"))).toBe(true);
    expect(isExcludedVoice(voice("Samantha", "en-US"))).toBe(false);
  });
});

describe("chooseEnglishVoice", () => {
  it("prefers the neural voice in the requested accent over the OS default", () => {
    const choice = chooseEnglishVoice(desktop, "en-US");
    expect(choice?.voice.name).toMatch(/Aria Online \(Natural\)/);
    expect(choice?.tier).toBe("NEURAL");
    expect(choice?.accentMatched).toBe(true);
  });

  it("keeps the requested accent ahead of a better-tier voice in another accent", () => {
    const choice = chooseEnglishVoice(desktop, "en-GB");
    expect(choice?.voice.name).toBe("Daniel");
    expect(choice?.accentMatched).toBe(true);
  });

  it("falls back to another English accent and reports the mismatch", () => {
    const choice = chooseEnglishVoice([voice("Samantha", "en-US")], "en-GB");
    expect(choice?.voice.name).toBe("Samantha");
    expect(choice?.accentMatched).toBe(false);
  });

  it("ranks Google remote voices last but still uses them when nothing else exists", () => {
    const ranked = rankEnglishVoices(desktop, "en-US").filter((item) => item.accentMatched);
    expect(ranked.at(-1)?.voice.name).toBe("Google US English");
    const androidOnly = [voice("Google US English", "en-US", { localService: false })];
    expect(chooseEnglishVoice(androidOnly, "en-US")?.voice.name).toBe("Google US English");
  });

  it("never returns an excluded or non-English voice", () => {
    const ranked = rankEnglishVoices(desktop, "en-US").map((item) => item.voice.name);
    expect(ranked).not.toContain("Bad News");
    expect(ranked).not.toContain("Zarvox");
    expect(ranked).not.toContain("Linh");
    expect(chooseEnglishVoice([voice("Zarvox", "en-US")], "en-US")).toBeUndefined();
  });

  it("accepts underscore locale tags from Android", () => {
    expect(chooseEnglishVoice([voice("English United States", "en_US")], "en-US")?.accentMatched).toBe(true);
  });
});

describe("curated listenability (Plan18)", () => {
  // A real Windows 11 + Edge machine: many Microsoft Natural voices in one tier.
  const windowsEdge = [
    voice("Microsoft Andrew Online (Natural) - English (United States)", "en-US"),
    voice("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
    voice("Microsoft Ava Online (Natural) - English (United States)", "en-US"),
    voice("Microsoft Emma Online (Natural) - English (United States)", "en-US"),
    voice("Microsoft Zira - English (United States)", "en-US", { default: true }),
    voice("Google US English", "en-US", { localService: false }),
  ];

  it("picks the most listenable voice inside the tier, not the alphabetical one", () => {
    // Before Plan18 the sort fell through to name order and returned "Andrew".
    const choice = chooseEnglishVoice(windowsEdge, "en-US");
    expect(choice?.voice.name).toMatch(/Ava Online \(Natural\)/);
    expect(choice?.curated?.key).toBe("ava");
    expect(choice?.tier).toBe("NEURAL");

    const order = rankEnglishVoices(windowsEdge, "en-US").map((item) => item.curated?.key);
    expect(order).toEqual(["ava", "emma", "andrew", "aria", "zira", "google us english"]);
  });

  it("never lets a curated score cross a tier boundary", () => {
    // Google US English is curated (60) but REMOTE; the uncurated system voice wins.
    const ranked = rankEnglishVoices(
      [voice("Google US English", "en-US", { localService: false }), voice("Some Unknown Voice", "en-US")],
      "en-US",
    );
    expect(ranked.map((item) => item.voice.name)).toEqual(["Some Unknown Voice", "Google US English"]);
    expect(ranked[0]?.quality).toBe(200);
    expect(ranked[1]?.quality).toBe(160);
  });

  it("keeps the requested accent ahead of a higher-scoring voice in another accent", () => {
    const ranked = rankEnglishVoices(
      [
        voice("Microsoft Ava Online (Natural) - English (United States)", "en-US"),
        voice("Microsoft Thomas Online (Natural) - English (United Kingdom)", "en-GB"),
      ],
      "en-GB",
    );
    expect(ranked[0]?.voice.name).toMatch(/Thomas/);
    expect(ranked[0]?.quality).toBeLessThan(ranked[1]?.quality ?? 0);
  });

  it("still ranks voices that are not in the catalogue", () => {
    const ranked = rankEnglishVoices([voice("Microsoft Natasha Online (Natural) - English (Australia)", "en-AU")], "en-US");
    expect(ranked[0]?.curated).toBeUndefined();
    expect(ranked[0]?.quality).toBe(400);
    expect(ranked[0]?.accentMatched).toBe(false);
  });
});

describe("chooseVietnameseVoice", () => {
  it("returns the default Vietnamese voice when present", () => {
    const voices = [voice("Linh", "vi-VN"), voice("An", "vi-VN", { default: true }), voice("Samantha", "en-US")];
    expect(chooseVietnameseVoice(voices)?.name).toBe("An");
    expect(chooseVietnameseVoice([voice("Samantha", "en-US")])).toBeUndefined();
  });
});
