/**
 * Deterministic pronunciation scoring from a speech-recognition transcript
 * (Plan14 SPEC-P141 §3).
 *
 * The browser recogniser returns words, not phonemes, so this is a word-level
 * intelligibility score: did the recogniser hear the words the learner was
 * asked to say? It reuses the dictation diff so the behaviour matches how the
 * rest of the app compares text. It never sees audio and never guesses about
 * accent; the verdict thresholds are conservative for that reason.
 */

import { assessDictation, type WordDiff } from "@/core/assessment/engine";

export type PronunciationWordStatus = "MATCH" | "CLOSE" | "MISSED" | "EXTRA";

export interface PronunciationWord {
  expected: string | null;
  heard: string | null;
  status: PronunciationWordStatus;
}

export type PronunciationVerdict = "GOOD" | "ALMOST" | "RETRY";

export interface PronunciationResult {
  /** 0..1 intelligibility score. */
  score: number;
  verdict: PronunciationVerdict;
  words: PronunciationWord[];
  /** Expected words the learner should say again, in sentence order. */
  retryWords: string[];
  feedbackVi: string;
  /** Echo of the recogniser's confidence when provided; informational only. */
  recognitionConfidence: number | null;
}

export const PRONUNCIATION_GOOD_THRESHOLD = 0.85;
export const PRONUNCIATION_ALMOST_THRESHOLD = 0.6;
export const MAX_PRONUNCIATION_TEXT_CHARS = 300;

/**
 * Words a recogniser cannot tell apart by sound. Hearing one for the other is
 * evidence of correct pronunciation, not a mistake, so they count as MATCH.
 */
const HOMOPHONE_GROUPS: string[][] = [
  ["their", "there", "they're"],
  ["to", "too", "two"],
  ["its", "it's"],
  ["your", "you're"],
  ["whose", "who's"],
  ["for", "four"],
  ["one", "won"],
  ["right", "write"],
  ["know", "no"],
  ["hear", "here"],
  ["by", "buy", "bye"],
  ["see", "sea"],
  ["meet", "meat"],
  ["wear", "where"],
  ["weather", "whether"],
  ["hour", "our"],
  ["ate", "eight"],
  ["red", "read"],
  ["i", "eye"],
  ["would", "wood"],
  ["new", "knew"],
  ["son", "sun"],
  ["week", "weak"],
  ["flour", "flower"],
  ["piece", "peace"],
];

const HOMOPHONE_INDEX = new Map<string, number>();
HOMOPHONE_GROUPS.forEach((group, index) => group.forEach((word) => HOMOPHONE_INDEX.set(word, index)));

function soundsAlike(expected: string, heard: string) {
  const a = HOMOPHONE_INDEX.get(expected);
  return a !== undefined && a === HOMOPHONE_INDEX.get(heard);
}

function toWord(diff: WordDiff): PronunciationWord {
  switch (diff.type) {
    case "CORRECT":
      return { expected: diff.expected, heard: diff.actual ?? diff.expected, status: "MATCH" };
    case "SPELLING":
      return { expected: diff.expected, heard: diff.actual, status: "CLOSE" };
    case "MISSING":
      return { expected: diff.expected, heard: null, status: "MISSED" };
    case "EXTRA":
      return { expected: null, heard: diff.actual, status: "EXTRA" };
    case "SUBSTITUTION":
      if (diff.expected && diff.actual && soundsAlike(diff.expected, diff.actual)) {
        return { expected: diff.expected, heard: diff.actual, status: "MATCH" };
      }
      return { expected: diff.expected, heard: diff.actual, status: "MISSED" };
  }
}

function buildFeedback(verdict: PronunciationVerdict, retryWords: string[], heardNothing: boolean) {
  if (heardNothing) return "Chưa nghe thấy gì. Hãy nói to, rõ và sát micro hơn rồi thử lại.";
  if (verdict === "GOOD") return "Rất rõ! Máy nhận đúng gần như toàn bộ câu.";
  const focus = retryWords.slice(0, 3).join(", ");
  if (verdict === "ALMOST") return `Gần đúng. Hãy nói chậm lại và nhấn rõ: ${focus}.`;
  return `Máy chưa nghe rõ. Nghe lại mẫu rồi nói từng cụm ngắn, chú ý: ${focus}.`;
}

export function scorePronunciation(
  expected: string,
  transcript: string,
  recognitionConfidence?: number | null,
): PronunciationResult {
  const assessment = assessDictation(expected, transcript);
  const words = assessment.wordDiffs.map(toWord);
  const expectedWords = words.filter((word) => word.expected !== null);
  const heardNothing = assessment.normalizedActual.length === 0;

  const credit = expectedWords.reduce((total, word) => {
    if (word.status === "MATCH") return total + 1;
    if (word.status === "CLOSE") return total + 0.5;
    return total;
  }, 0);
  const extras = words.filter((word) => word.status === "EXTRA").length;
  const denominator = Math.max(expectedWords.length, 1);
  const raw = credit / denominator - Math.min(0.3, (extras * 0.1) / denominator);
  const score = heardNothing ? 0 : Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;

  const verdict: PronunciationVerdict =
    score >= PRONUNCIATION_GOOD_THRESHOLD ? "GOOD" : score >= PRONUNCIATION_ALMOST_THRESHOLD ? "ALMOST" : "RETRY";
  const retryWords = expectedWords
    .filter((word) => word.status !== "MATCH")
    .map((word) => word.expected as string);

  return {
    score,
    verdict,
    words,
    retryWords,
    feedbackVi: buildFeedback(verdict, retryWords, heardNothing),
    recognitionConfidence:
      typeof recognitionConfidence === "number" && Number.isFinite(recognitionConfidence)
        ? Math.max(0, Math.min(1, recognitionConfidence))
        : null,
  };
}
