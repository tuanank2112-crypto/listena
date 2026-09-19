import { describe, expect, it } from "vitest";
import {
  classifyStanding,
  countLearned,
  rankWeakWords,
  selectRandomReview,
  toReviewWord,
  type MasteryRow,
} from "./weak-words";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function row(overrides: Partial<MasteryRow> & { vocabularyItemId: string }): MasteryRow {
  return {
    displayText: overrides.vocabularyItemId,
    meaningVi: `nghĩa ${overrides.vocabularyItemId}`,
    ipa: null,
    correctCount: 0,
    incorrectCount: 0,
    masteryScore: 0,
    nextReviewAt: null,
    ...overrides,
  };
}

describe("classifyStanding", () => {
  it("calls a word weak as soon as it has been missed once, however often it was right", () => {
    expect(classifyStanding({ correctCount: 9, incorrectCount: 1 })).toBe("weak");
  });

  it("only calls a word learned after two correct answers and no misses", () => {
    expect(classifyStanding({ correctCount: 2, incorrectCount: 0 })).toBe("learned");
    expect(classifyStanding({ correctCount: 1, incorrectCount: 0 })).toBe("shaky");
  });
});

describe("toReviewWord", () => {
  it("marks a word due when its next review has passed, and not due without a schedule", () => {
    const due = toReviewWord(row({ vocabularyItemId: "a", nextReviewAt: new Date(NOW.getTime() - 1000) }), NOW);
    const later = toReviewWord(row({ vocabularyItemId: "b", nextReviewAt: new Date(NOW.getTime() + 1000) }), NOW);
    const unscheduled = toReviewWord(row({ vocabularyItemId: "c", nextReviewAt: null }), NOW);
    expect([due.dueNow, later.dueNow, unscheduled.dueNow]).toEqual([true, false, false]);
  });
});

describe("rankWeakWords", () => {
  it("keeps only words with a miss and puts the most-missed first", () => {
    const ranked = rankWeakWords([
      row({ vocabularyItemId: "clean", correctCount: 5, incorrectCount: 0 }),
      row({ vocabularyItemId: "once", correctCount: 3, incorrectCount: 1 }),
      row({ vocabularyItemId: "often", correctCount: 1, incorrectCount: 4 }),
    ], NOW, 10);
    expect(ranked.map((word) => word.vocabularyItemId)).toEqual(["often", "once"]);
  });

  it("breaks an equal miss count on accuracy, so the word answered right less often comes first", () => {
    const ranked = rankWeakWords([
      row({ vocabularyItemId: "recovering", correctCount: 8, incorrectCount: 2 }),
      row({ vocabularyItemId: "struggling", correctCount: 1, incorrectCount: 2 }),
    ], NOW, 10);
    expect(ranked.map((word) => word.vocabularyItemId)).toEqual(["struggling", "recovering"]);
  });

  it("orders identical rows by the word itself, so two requests over the same data agree", () => {
    const rows = [
      row({ vocabularyItemId: "beta", displayText: "beta", correctCount: 1, incorrectCount: 1 }),
      row({ vocabularyItemId: "alpha", displayText: "alpha", correctCount: 1, incorrectCount: 1 }),
    ];
    expect(rankWeakWords(rows, NOW, 10).map((word) => word.displayText)).toEqual(["alpha", "beta"]);
    expect(rankWeakWords([...rows].reverse(), NOW, 10).map((word) => word.displayText)).toEqual(["alpha", "beta"]);
  });

  it("honours the limit", () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({ vocabularyItemId: `w${index}`, incorrectCount: index + 1 }));
    expect(rankWeakWords(rows, NOW, 20)).toHaveLength(20);
  });
});

describe("selectRandomReview", () => {
  it("leans towards the weaker word when both draw the same number", () => {
    const rows = [
      row({ vocabularyItemId: "solid", masteryScore: 0.9 }),
      row({ vocabularyItemId: "shaky", masteryScore: 0.1 }),
    ];
    expect(selectRandomReview(rows, NOW, 1, () => 0.5)[0]?.vocabularyItemId).toBe("shaky");
  });

  it("still lets a solid word in when its draw is low enough, so the pool is not the weak list again", () => {
    const draws = [0.01, 0.99];
    let index = 0;
    const rows = [
      row({ vocabularyItemId: "solid", masteryScore: 1 }),
      row({ vocabularyItemId: "shaky", masteryScore: 0 }),
    ];
    const picked = selectRandomReview(rows, NOW, 1, () => draws[index++] ?? 0);
    expect(picked[0]?.vocabularyItemId).toBe("solid");
  });

  it("returns nothing for a non-positive count and never more than it was asked for", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row({ vocabularyItemId: `w${index}` }));
    expect(selectRandomReview(rows, NOW, 0, () => 0.5)).toEqual([]);
    expect(selectRandomReview(rows, NOW, 4, () => 0.5)).toHaveLength(4);
    expect(selectRandomReview(rows, NOW, 40, () => 0.5)).toHaveLength(10);
  });
});

describe("countLearned", () => {
  it("counts only words answered right twice and never missed", () => {
    expect(countLearned([
      row({ vocabularyItemId: "a", correctCount: 2, incorrectCount: 0 }),
      row({ vocabularyItemId: "b", correctCount: 9, incorrectCount: 1 }),
      row({ vocabularyItemId: "c", correctCount: 1, incorrectCount: 0 }),
    ])).toBe(1);
  });
});
