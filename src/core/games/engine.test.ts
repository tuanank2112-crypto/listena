import { describe, expect, it } from "vitest";
import { checkSpell, clozeSentence, matchCards, quizOptions, sample, scrambleLetters, scorePoints, shuffle } from "./engine";
import type { GameWord } from "./types";

const words: GameWord[] = [
  { id: "1", displayText: "weather", meaningVi: "thời tiết", ipa: "/wɛðə/", exampleSentence: "The weather is nice today." },
  { id: "2", displayText: "sun", meaningVi: "mặt trời", ipa: "/sʌn/", exampleSentence: "The sun is bright." },
  { id: "3", displayText: "rain", meaningVi: "mưa", ipa: "/reɪn/", exampleSentence: "I like rain." },
  { id: "4", displayText: "wind", meaningVi: "gió", ipa: "/wɪnd/", exampleSentence: "The wind blows hard." },
];

describe("game engine", () => {
  it("shuffles and preserves items", () => {
    const result = shuffle([1, 2, 3, 4, 5]);
    expect(result).toHaveLength(5);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("samples without replacement", () => {
    const result = sample(words, 2);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((w) => w.id)).size).toBe(2);
  });

  it("accepts punctuation and case drift in spell answers", () => {
    expect(checkSpell("Weather", "weather!")).toBe(true);
    expect(checkSpell("weather", "wether")).toBe(false);
  });

  it("builds 4 quiz options with the correct meaning", () => {
    const options = quizOptions(words[0], words);
    expect(options).toHaveLength(4);
    expect(options).toContain(words[0].meaningVi);
  });

  it("builds 2 match cards per word", () => {
    const cards = matchCards(words.slice(0, 2));
    expect(cards).toHaveLength(4);
  });

  it("scramble preserves letters", () => {
    const letters = scrambleLetters(words[0]);
    expect([...letters].sort().join("")).toBe([...words[0].displayText].sort().join(""));
  });

  it("masks the target word in cloze sentences", () => {
    expect(clozeSentence(words[0])).toContain("____");
  });

  it("scores correct answers and resets wrong answers", () => {
    expect(scorePoints("quiz", true, 2, 20, 60)).toBeGreaterThan(0);
    expect(scorePoints("quiz", false, 2, 20, 60)).toBe(0);
  });
});
