import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_LINE_CHARS, detectSpokenLang, prepareSpokenText, toSpokenString } from "./spoken-text";

describe("prepareSpokenText", () => {
  it("splits into capitalised sentences with terminal punctuation", () => {
    const script = prepareSpokenText("hello there. how are you today", "en");
    expect(script.lines).toEqual([
      { lang: "en", text: "Hello there." },
      { lang: "en", text: "How are you today." },
    ]);
  });

  it("removes markdown, emoji, URLs, IPA and stage directions", () => {
    const script = prepareSpokenText(
      "**Great job!** 🎉 Say /ˈwɔːtər/ again [smiles]. See https://example.com for more.",
      "en",
    );
    expect(script.lines.map((line) => line.text)).toEqual(["Great job!", "Say again.", "See for more."]);
    expect(script.lines.every((line) => !/[*🎉/\[]/.test(line.text))).toBe(true);
  });

  it("expands abbreviations and symbols the way a teacher reads them", () => {
    const script = prepareSpokenText("Mr. Smith earns $5 & 10% more, e.g. on Fridays.", "en");
    expect(script.lines[0]?.text).toBe("Mister Smith earns 5 dollars and 10 percent more, for example on Fridays.");
  });

  it("routes Vietnamese sentences to the Vietnamese voice even inside English text", () => {
    const script = prepareSpokenText("Well done. Bạn đã dùng đúng thì quá khứ. Try again!", "en");
    expect(script.lines).toEqual([
      { lang: "en", text: "Well done." },
      { lang: "vi", text: "Bạn đã dùng đúng thì quá khứ." },
      { lang: "en", text: "Try again!" },
    ]);
  });

  it("drops fragments without pronounceable letters", () => {
    const script = prepareSpokenText("!!! ... 123", "en");
    expect(script.lines.map((line) => line.text)).toEqual(["123."]);
    expect(script.dropped).toEqual(["..."]);
  });

  it("reads fill-in blanks as the word blank", () => {
    expect(prepareSpokenText("I ___ to school yesterday.", "en").lines[0]?.text).toBe("I blank to school yesterday.");
  });

  it("splits overlong sentences at clause boundaries", () => {
    const clause = "we walked along the beach and talked about the weather";
    const long = Array.from({ length: 6 }, () => clause).join(", ") + ".";
    const script = prepareSpokenText(long, "en");
    expect(script.lines.length).toBeGreaterThan(1);
    expect(script.lines.every((line) => line.text.length <= MAX_SPOKEN_LINE_CHARS + 1)).toBe(true);
  });

  it("normalises curly quotes and dashes", () => {
    expect(prepareSpokenText("I don’t know — maybe “later”.", "en").lines[0]?.text).toBe("I don't know, maybe \"later\".");
  });

  it("returns an empty script for empty input", () => {
    expect(prepareSpokenText("", "en")).toEqual({ lines: [], dropped: [] });
  });
});

describe("detectSpokenLang", () => {
  it("uses diacritics to detect Vietnamese and otherwise the fallback", () => {
    expect(detectSpokenLang("Xin chào", "en")).toBe("vi");
    expect(detectSpokenLang("Hello", "en")).toBe("en");
    expect(detectSpokenLang("Hello", "vi")).toBe("en");
    expect(detectSpokenLang("2024", "vi")).toBe("vi");
  });
});

describe("toSpokenString", () => {
  it("joins only the requested language", () => {
    const script = prepareSpokenText("Well done. Rất tốt. Try again.", "en");
    expect(toSpokenString(script, "en")).toBe("Well done. Try again.");
    expect(toSpokenString(script, "vi")).toBe("Rất tốt.");
  });
});
