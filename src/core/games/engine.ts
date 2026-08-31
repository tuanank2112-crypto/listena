/**
 * Game engine helpers: deterministic shuffle, spelling check, round generators.
 * Pure functions — components stay thin and testable.
 */

import { normalizeText } from "@/core/text/normalize";
import type { GameWord, GameMode } from "./types";

/** Fisher-Yates shuffle — unbiased. */
export function shuffle<T>(items: readonly T[], random?: () => number): T[] {
  const r = random ?? Math.random;
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Pick `count` items without replacement. */
export function sample<T>(items: readonly T[], count: number, random?: () => number): T[] {
  return shuffle(items, random).slice(0, Math.max(1, count));
}

/** Spell check — accept punctuation/case/spacing drift. */
export function checkSpell(expected: string, answer: string): boolean {
  return normalizeText(answer) === normalizeText(expected);
}

/** Generate quiz options: 1 correct + 3 distractors. */
export function quizOptions(
  right: GameWord,
  pool: GameWord[],
  random?: () => number,
): string[] {
  const distractors = shuffle(
    pool.filter((w) => w.id !== right.id),
    random,
  ).slice(0, 3);
  return shuffle([right.meaningVi, ...distractors.map((w) => w.meaningVi)], random);
}

/** Build match cards: one word + one meaning per word, shuffled. */
export function matchCards(words: GameWord[], random?: () => number) {
  const cards = words.flatMap((w) => [
    { id: w.id, kind: "word" as const, label: w.displayText },
    { id: w.id, kind: "meaning" as const, label: w.meaningVi },
  ]);
  return shuffle(cards, random);
}

/** Scramble a word's letters (excluding spaces). */
export function scrambleLetters(word: GameWord, random?: () => number): string[] {
  const letters = word.displayText.replace(/\s+/g, "").split("");
  const r = random ?? Math.random;
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

/** Cloze — mask the word in its example sentence. */
export function clozeSentence(word: GameWord): string {
  const sentence = (word.exampleSentence ?? `I can use the word "${word.displayText}".`).trim();
  const escaped = word.displayText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(sentence) ? sentence.replace(regex, "____") : `${sentence} ____`;
}

/** Points for one answer. */
export function scorePoints(
  mode: GameMode,
  correct: boolean,
  streak: number,
  timeLeftMs: number,
  timeLimitMs: number,
): number {
  if (!correct) return 0;
  const base = { quiz: 15, match: 20, spell: 25, scramble: 20, cloze: 20, sprint: 10 }[mode] ?? 15;
  const streakBonus = Math.min(streak, 5) * 2;
  const speedRatio = Math.max(0, timeLeftMs / timeLimitMs);
  const speedBonus = Math.round(speedRatio * 10);
  return base + streakBonus + speedBonus;
}
