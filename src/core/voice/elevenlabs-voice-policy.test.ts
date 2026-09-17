import { describe, expect, it } from "vitest";
import {
  buildCuratedCatalogue,
  detectAccent,
  rankElevenEnglishVoices,
  rankElevenVietnameseVoices,
  scoreEnglishVoice,
  type ElevenVoiceCandidate,
} from "./elevenlabs-voice-policy";

function voice(name: string, labels: Record<string, string>, extra: Partial<ElevenVoiceCandidate> = {}): ElevenVoiceCandidate {
  return { voice_id: `id-${name.toLowerCase().replace(/\W+/g, "-")}`, name, category: "premade", labels, ...extra };
}

const account: ElevenVoiceCandidate[] = [
  voice("Talia - Warm Soft Guide", { accent: "American", gender: "female", age: "young", use_case: "narration", description: "warm soft guide" }),
  voice("Finley - Articulate Anchor", { accent: "American", gender: "male", age: "middle-aged", use_case: "news", description: "articulate" }),
  voice("Eldrin - Crisp British Baritone", { accent: "British", gender: "male", age: "middle-aged", use_case: "narration", description: "crisp" }),
  voice("Alicia - Polished Global Anchor", { accent: "British", gender: "female", age: "middle-aged", use_case: "news", description: "polished" }),
  voice("Kaelen - Amateur Warrior", { accent: "American", gender: "male", age: "young", use_case: "video games", description: "warrior character" }),
  voice("Natasha - Valley Girl", { accent: "American", gender: "female", age: "young", use_case: "social media", description: "energetic valley girl" }),
  voice("Baxter - Dry Calm Aussie", { accent: "Australian", gender: "male", age: "middle-aged", use_case: "conversational", description: "dry calm" }),
  voice("Linh", { gender: "female", language: "vi", description: "clear" }, { verified_languages: [{ language: "vi", accent: "northern" }] }),
];

describe("ElevenLabs voice policy", () => {
  it("detects accents from labels, names and verified languages", () => {
    expect(detectAccent(voice("X", { accent: "american" }))).toBe("american");
    expect(detectAccent(voice("Eldrin - Crisp British Baritone", {}))).toBe("british");
    expect(detectAccent(voice("Y", {}, { verified_languages: [{ language: "en", accent: "british" }] }))).toBe("british");
    expect(detectAccent(voice("Z", { accent: "australian" }))).toBe("other");
  });

  it("ranks known clear voices in the requested accent first and drops character voices", () => {
    const us = rankElevenEnglishVoices(account, "american");
    expect(us[0]?.name).toBe("Talia");
    expect(us[1]?.name).toBe("Finley");
    expect(us.map((item) => item.name)).not.toContain("Kaelen");
    expect(us.map((item) => item.name)).not.toContain("Natasha");
    expect(us[0]?.tier).toBe("TOP");
  });

  it("keeps the requested accent ahead of a better-known voice in another accent", () => {
    const gb = rankElevenEnglishVoices(account, "british");
    expect(gb.slice(0, 2).map((item) => item.name).sort()).toEqual(["Alicia", "Eldrin"]);
    expect(gb.slice(0, 2).every((item) => item.accent === "british")).toBe(true);
  });

  it("alternates gender near the top so both a female and a male model appear", () => {
    const us = rankElevenEnglishVoices(account, "american");
    expect(new Set(us.slice(0, 2).map((item) => item.gender))).toEqual(new Set(["female", "male"]));
  });

  it("scores unknown but well-described voices positively and novelty descriptions negatively", () => {
    expect(scoreEnglishVoice(voice("Nova", { accent: "American", description: "clear neutral professional narrator" }), "american")).toBeGreaterThan(30);
    expect(scoreEnglishVoice(voice("Grim", { accent: "American", description: "creepy villain whisper" }), "american")).toBeLessThan(0);
  });

  it("prefers voices verified for Vietnamese and falls back to neutral voices otherwise", () => {
    expect(rankElevenVietnameseVoices(account)[0]?.name).toBe("Linh");
    const noVi = account.filter((item) => item.name !== "Linh");
    expect(rankElevenVietnameseVoices(noVi)[0]?.name).toBe("Talia");
  });

  it("builds a catalogue with human subtitles and preview urls", () => {
    const catalogue = buildCuratedCatalogue(account);
    expect(catalogue["en-US"][0]).toMatchObject({ id: "id-talia-warm-soft-guide", subtitle: "Mỹ · nữ · Warm soft guide", previewUrl: null });
    expect(catalogue["en-GB"].length).toBeGreaterThan(0);
    expect(catalogue.vi[0]?.name).toBe("Linh");
    expect(buildCuratedCatalogue([])).toEqual({ "en-US": [], "en-GB": [], vi: [] });
  });
});
