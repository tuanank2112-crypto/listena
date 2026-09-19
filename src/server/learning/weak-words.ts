/**
 * Plan20 SPEC-P201 — which words a learner keeps getting wrong, and a random
 * pool to re-check across lessons.
 *
 * Everything here is a pure function over `VocabularyMastery` rows the server
 * already writes. Nothing in this module grades an answer, writes mastery, or
 * touches the SM-2 schedule: the reference app that inspired the screen graded
 * on the client, and this one deliberately does not. Selection happens on the
 * server so the client cannot choose which words it is asked about.
 */

/** The mastery columns this module reads. */
export interface MasteryRow {
  vocabularyItemId: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number;
  nextReviewAt: Date | null;
}

export type WordStanding = "weak" | "shaky" | "learned";

export interface ReviewWord {
  vocabularyItemId: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number;
  standing: WordStanding;
  dueNow: boolean;
}

/**
 * `learned` follows the rule the reference app used — answered right at least
 * twice and never wrong — because a learner recognises it. `weak` is any word
 * they have got wrong at least once. Everything else is `shaky`: seen, not yet
 * proven either way.
 */
export function classifyStanding(row: Pick<MasteryRow, "correctCount" | "incorrectCount">): WordStanding {
  if (row.incorrectCount > 0) return "weak";
  if (row.correctCount >= 2) return "learned";
  return "shaky";
}

export function toReviewWord(row: MasteryRow, now: Date): ReviewWord {
  return {
    vocabularyItemId: row.vocabularyItemId,
    displayText: row.displayText,
    meaningVi: row.meaningVi,
    ipa: row.ipa,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    masteryScore: row.masteryScore,
    standing: classifyStanding(row),
    dueNow: row.nextReviewAt !== null && row.nextReviewAt.getTime() <= now.getTime(),
  };
}

/**
 * Worst first. Wrong answers dominate, because a word missed four times needs
 * attention before one missed once; ties break on accuracy, then on mastery,
 * then on the word itself so the order never wobbles between two requests over
 * identical data.
 */
export function rankWeakWords(rows: MasteryRow[], now: Date, limit: number): ReviewWord[] {
  return rows
    .filter((row) => row.incorrectCount > 0)
    .map((row) => toReviewWord(row, now))
    .sort((a, b) => {
      if (a.incorrectCount !== b.incorrectCount) return b.incorrectCount - a.incorrectCount;
      const accuracyA = a.correctCount / (a.correctCount + a.incorrectCount);
      const accuracyB = b.correctCount / (b.correctCount + b.incorrectCount);
      if (accuracyA !== accuracyB) return accuracyA - accuracyB;
      if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
      return a.displayText.localeCompare(b.displayText);
    })
    .slice(0, limit);
}

/**
 * A random pool across every lesson the learner has met, leaning towards words
 * they hold least firmly. Each row draws `random() * (0.5 + masteryScore)`, so
 * a shaky word can still lose to a solid one — the pool stays a genuine mixed
 * re-check rather than the weak list again under another name.
 *
 * `random` is injected so tests pin an exact pool; callers pass `Math.random`.
 */
export function selectRandomReview(
  rows: MasteryRow[],
  now: Date,
  count: number,
  random: () => number,
): ReviewWord[] {
  if (count <= 0) return [];
  return rows
    .map((row) => ({ row, draw: random() * (0.5 + row.masteryScore) }))
    .sort((a, b) => a.draw - b.draw)
    .slice(0, count)
    .map((entry) => toReviewWord(entry.row, now));
}

export function countLearned(rows: MasteryRow[]): number {
  return rows.filter((row) => classifyStanding(row) === "learned").length;
}
