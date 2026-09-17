import { describe, expect, it } from "vitest";
import {
  buildAssistPayload,
  buildAssistSeed,
  buildSkeleton,
  buildTiles,
  createSeededRandom,
  pickDecoys,
  splitAnswerWords,
} from "./attempt-assist";

const LESSON_WORDS = [
  "Last summer my family went to Da Nang for a holiday.",
  "We swam in the sea and built sandcastles on the beach.",
  "The hotel had a lovely view of the mountains.",
];

describe("attempt-assist seed", () => {
  it("derives a stable sha256 seed from clientAttemptId + mode and a stable RNG", () => {
    const a = buildAssistSeed("attempt-1", "TILES");
    expect(a).toBe(buildAssistSeed("attempt-1", "TILES"));
    expect(a).not.toBe(buildAssistSeed("attempt-1", "SKELETON"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const first = createSeededRandom(a);
    const second = createSeededRandom(a);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});

describe("buildSkeleton", () => {
  it("returns one slot per normalized word with the grader's word lengths", () => {
    const { slots } = buildSkeleton("They went to Da Nang.", "0".repeat(64));
    expect(slots.map((slot) => slot.length)).toEqual([4, 4, 2, 2, 4]);
    expect(splitAnswerWords("They went to Da Nang.")).toEqual(["they", "went", "to", "da", "nang"]);
  });

  it("reveals the first letter of at most one third of the words, chosen by seed", () => {
    const answer = "we had lunch at a small restaurant near the beach";
    const seedA = buildAssistSeed("client-a", "SKELETON");
    const seedB = buildAssistSeed("client-b", "SKELETON");
    const a = buildSkeleton(answer, seedA);
    const b = buildSkeleton(answer, seedB);
    const revealedA = a.slots.filter((slot) => slot.first).length;
    expect(revealedA).toBe(Math.floor(10 / 3));
    expect(revealedA).toBeLessThanOrEqual(Math.floor(10 / 3));
    expect(a.slots).toEqual(buildSkeleton(answer, seedA).slots);
    expect(a.slots.map((slot) => slot.first ?? null)).not.toEqual(b.slots.map((slot) => slot.first ?? null));
    a.slots.forEach((slot, index) => {
      if (slot.first) expect(slot.first).toBe(answer.split(" ")[index][0]);
    });
    expect(a.text.split("   ")).toHaveLength(10);
    expect(buildSkeleton("beautiful", seedA).slots).toEqual([{ length: 9 }]);
  });
});

describe("buildTiles", () => {
  it("shuffles the answer words deterministically and never keeps the answer order", () => {
    const answer = "They went to Da Nang.";
    const answerWords = splitAnswerWords(answer);
    for (let index = 0; index < 40; index += 1) {
      const seed = buildAssistSeed(`client-${index}`, "TILES");
      const tiles = buildTiles(answer, LESSON_WORDS, seed);
      expect(tiles).toEqual(buildTiles(answer, LESSON_WORDS, seed));
      expect(tiles).toHaveLength(answerWords.length + 2);
      for (const word of answerWords) expect(tiles).toContain(word);
      expect(tiles.filter((tile) => answerWords.includes(tile))).not.toEqual(answerWords);
    }
  });

  it("adds two decoys from the lesson that are not answer words and prefer similar lengths", () => {
    const answer = "we swam in the sea";
    const answerWords = splitAnswerWords(answer);
    const decoys = pickDecoys(answerWords, LESSON_WORDS, createSeededRandom("ab".repeat(32)));
    expect(decoys).toHaveLength(2);
    for (const decoy of decoys) {
      expect(answerWords).not.toContain(decoy);
      expect(decoy).toMatch(/^[a-z0-9']+$/);
      expect(answerWords.some((word) => Math.abs(word.length - decoy.length) <= 1)).toBe(true);
    }
    const tiles = buildTiles(answer, LESSON_WORDS, "cd".repeat(32));
    const extra = tiles.filter((tile) => !answerWords.includes(tile));
    expect(extra).toHaveLength(2);
  });

  it("degrades gracefully when the lesson has no usable decoys or a single-word answer", () => {
    const seed = buildAssistSeed("client-x", "TILES");
    expect(buildTiles("beautiful", [], seed)).toEqual(["beautiful"]);
    const tiles = buildTiles("beautiful", LESSON_WORDS, seed);
    expect(tiles).toHaveLength(3);
    expect(tiles).toContain("beautiful");
    expect(buildTiles("the the cat", ["the cat sat"], seed).filter((tile) => tile === "the")).toHaveLength(2);
  });
});

describe("buildAssistPayload", () => {
  it("maps each mode to its hint cost and payload shape", () => {
    const skeleton = buildAssistPayload({
      mode: "SKELETON",
      answer: "Can I see your passport, please?",
      lessonWords: LESSON_WORDS,
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
    });
    expect(skeleton).toMatchObject({ mode: "SKELETON", hintCost: 1 });
    expect(skeleton.skeleton?.map((slot) => slot.length)).toEqual([3, 1, 3, 4, 8, 6]);
    expect(skeleton.skeletonText).toContain("_");
    expect(skeleton.tiles).toBeUndefined();

    const tiles = buildAssistPayload({
      mode: "TILES",
      answer: "Can I see your passport, please?",
      lessonWords: LESSON_WORDS,
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
    });
    expect(tiles).toMatchObject({ mode: "TILES", hintCost: 2 });
    expect(tiles.tiles).toHaveLength(8);
    expect(tiles.skeleton).toBeUndefined();
    expect(tiles.tiles?.join(" ")).not.toContain("can i see your passport please");
  });
});
