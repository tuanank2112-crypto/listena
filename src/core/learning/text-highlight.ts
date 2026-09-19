/**
 * Plan21 SPEC-P213 — pointing at the wrong part of a sentence without
 * inventing it.
 *
 * `detectedError.actual` is whatever the model chose to put there. Production
 * has produced a genuine fragment ("lose"), several fragments packed into one
 * string ("have lost / two bag"), and plain prose ("present tense with
 * incorrect verb form"). Only the parts that really occur in what the learner
 * wrote may be marked; the rest is discarded rather than shown back to them.
 *
 * Both functions are pure and live in core because the server decides what to
 * mark and the client draws it.
 */

/** Shortest fragment worth marking; one character would underline noise. */
const MIN_FRAGMENT = 2;

/** Separators the model uses when it packs several fragments into one string. */
const FRAGMENT_SEPARATORS = /[/;,]|->|→/;

/**
 * The parts of `actual` that are genuinely present in `learnerText`, in the
 * order the model listed them, without duplicates.
 */
export function findHighlights(learnerText: string, actual: string): string[] {
  if (!learnerText || !actual) return [];
  const haystack = learnerText.toLowerCase();
  const found: string[] = [];
  for (const piece of actual.split(FRAGMENT_SEPARATORS)) {
    const fragment = piece.trim();
    if (fragment.length < MIN_FRAGMENT) continue;
    if (!haystack.includes(fragment.toLowerCase())) continue;
    if (!found.some((existing) => existing.toLowerCase() === fragment.toLowerCase())) {
      found.push(fragment);
    }
  }
  return found;
}

/** A run of the learner's sentence, marked when it is part of the mistake. */
export interface TextSegment {
  text: string;
  marked: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cut the learner's sentence into marked and unmarked runs, so the page can
 * show the whole thing with the wrong part standing out. Returns one unmarked
 * run when there is nothing to mark, and nothing at all for empty text.
 */
export function segmentHighlights(text: string, highlights: string[]): TextSegment[] {
  if (!text) return [];
  const usable = highlights.filter((highlight) => highlight.trim().length >= MIN_FRAGMENT);
  if (!usable.length) return [{ text, marked: false }];

  // Longest first, so "two bags" wins over "two" where both were reported.
  const pattern = new RegExp(
    `(${[...usable].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`,
    "gi",
  );
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      marked: usable.some((highlight) => highlight.toLowerCase() === part.toLowerCase()),
    }));
}
