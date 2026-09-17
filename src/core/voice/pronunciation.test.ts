import { describe, expect, it } from "vitest";
import { scorePronunciation } from "./pronunciation";

describe("scorePronunciation", () => {
  it("scores an exact transcript as GOOD regardless of casing and punctuation", () => {
    const result = scorePronunciation("My suitcase is black.", "my suitcase is black");
    expect(result.score).toBe(1);
    expect(result.verdict).toBe("GOOD");
    expect(result.retryWords).toEqual([]);
    expect(result.words.every((word) => word.status === "MATCH")).toBe(true);
  });

  it("treats homophones as correct because the recogniser cannot hear the difference", () => {
    const result = scorePronunciation("Their bag is here.", "there bag is hear");
    expect(result.score).toBe(1);
    expect(result.verdict).toBe("GOOD");
  });

  it("lists the words to retry in sentence order", () => {
    const result = scorePronunciation("I would like a large coffee, please.", "I would like a lunch coffee");
    expect(result.retryWords).toEqual(["large", "please"]);
    expect(result.verdict).toBe("ALMOST");
    expect(result.feedbackVi).toContain("large");
  });

  it("returns zero with explicit feedback when nothing was heard", () => {
    const result = scorePronunciation("Good morning.", "   ");
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("RETRY");
    expect(result.feedbackVi).toMatch(/Chưa nghe thấy gì/);
  });

  it("gives half credit for near-miss words and penalises extra words", () => {
    const close = scorePronunciation("The weather is beautiful today.", "the weather is beautifull today");
    expect(close.score).toBe(0.9);
    const extra = scorePronunciation("Good morning.", "good morning everyone okay");
    expect(extra.score).toBeLessThan(1);
    expect(extra.words.filter((word) => word.status === "EXTRA")).toHaveLength(2);
  });

  it("clamps and echoes recogniser confidence without letting it change the score", () => {
    const a = scorePronunciation("Hello.", "hello", 0.2);
    const b = scorePronunciation("Hello.", "hello", 4);
    expect(a.score).toBe(b.score);
    expect(a.recognitionConfidence).toBe(0.2);
    expect(b.recognitionConfidence).toBe(1);
    expect(scorePronunciation("Hello.", "hello").recognitionConfidence).toBeNull();
  });
});
