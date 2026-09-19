import { describe, expect, it } from "vitest";
import { findHighlights, segmentHighlights } from "./text-highlight";

describe("findHighlights", () => {
  it("keeps only the fragments that are really in the learner's sentence", () => {
    // Observed on production: the model packed two fragments into one string,
    // and only the second was something the learner actually wrote.
    expect(findHighlights(
      "My family have three childrens and we losted two bag.",
      "have lost / two bag",
    )).toEqual(["two bag"]);
  });

  it("returns nothing when the model described the mistake instead of quoting it", () => {
    // Also observed on production. Underlining this would mark nothing, and
    // quoting it would show the learner words they never wrote.
    expect(findHighlights(
      "I arrived in Monday and my flight was land at 6 o'clock.",
      "present tense with incorrect verb form",
    )).toEqual([]);
  });

  it("matches without caring about case", () => {
    expect(findHighlights("Yesterday I Lose my bag.", "lose")).toEqual(["lose"]);
  });

  it("ignores one-character fragments that would underline half the sentence", () => {
    expect(findHighlights("I go to school", "I / a")).toEqual([]);
  });

  it("does not repeat a fragment the model listed twice", () => {
    expect(findHighlights("two bag and two bag", "two bag / two bag")).toEqual(["two bag"]);
  });

  it("is empty when either side is empty", () => {
    expect(findHighlights("", "lose")).toEqual([]);
    expect(findHighlights("I lose it", "")).toEqual([]);
  });
});

describe("segmentHighlights", () => {
  it("cuts the sentence around the wrong part", () => {
    expect(segmentHighlights("we losted two bag.", ["two bag"])).toEqual([
      { text: "we losted ", marked: false },
      { text: "two bag", marked: true },
      { text: ".", marked: false },
    ]);
  });

  it("returns the sentence untouched when there is nothing to mark", () => {
    expect(segmentHighlights("I arrived in Monday.", [])).toEqual([
      { text: "I arrived in Monday.", marked: false },
    ]);
  });

  it("prefers the longer fragment when two overlap", () => {
    const segments = segmentHighlights("we lost two bags today", ["two", "two bags"]);
    expect(segments.filter((segment) => segment.marked).map((segment) => segment.text)).toEqual(["two bags"]);
  });

  it("marks every occurrence, keeping the learner's own casing", () => {
    const segments = segmentHighlights("Lose it and lose again", ["lose"]);
    expect(segments.filter((segment) => segment.marked).map((segment) => segment.text)).toEqual(["Lose", "lose"]);
  });

  it("treats a fragment with regex characters as plain text", () => {
    expect(() => segmentHighlights("cost $5 (each)", ["$5 (each)"])).not.toThrow();
    expect(segmentHighlights("cost $5 (each)", ["$5 (each)"]).some((segment) => segment.marked)).toBe(true);
  });

  it("returns nothing for empty text", () => {
    expect(segmentHighlights("", ["x"])).toEqual([]);
  });
});
