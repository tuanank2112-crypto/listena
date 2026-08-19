/**
 * Assessment engine: word-level diff, error classification, and scoring.
 * Pure deterministic functions with no side effects.
 */

import { normalizeText, tokenize, normalizedLevenshtein, longestCommonSubsequence } from "../text/normalize";
import { SPELLING_LEVENSHTEIN_THRESHOLD } from "../constants";

// ── Types ────────────────────────────────────────────

export type ErrorType =
  | "SPELLING"
  | "MISSING_WORD"
  | "EXTRA_WORD"
  | "WORD_FORM"
  | "FUNCTION_WORD"
  | "PHONOLOGICAL"
  | "SEGMENTATION"
  | "GRAMMAR"
  | "VOCABULARY"
  | "UNKNOWN";

export interface WordDiff {
  type: "CORRECT" | "MISSING" | "EXTRA" | "SUBSTITUTION" | "SPELLING";
  expected: string | null;
  actual: string | null;
  position: number;
}

export interface AssessmentError {
  type: ErrorType;
  expected: string;
  actual: string | null;
  position: number;
  confidence: number;
}

export interface AssessmentResult {
  overallScore: number;
  exactAccuracy: number;
  wordAccuracy: number;
  spellingAccuracy: number;
  contentWordAccuracy: number;
  functionWordAccuracy: number;
  correctTokens: string[];
  wordDiffs: WordDiff[];
  errors: AssessmentError[];
  normalizedExpected: string;
  normalizedActual: string;
}

export function assessOpenResponse(answer: string): AssessmentResult {
  const base = assessDictation(answer, answer);
  const trimmedAnswer = answer.trim();
  const words = trimmedAnswer.split(/\s+/).filter(Boolean);
  const sentenceCount = trimmedAnswer
    .split(/[.!?]+/)
    .filter((sentence) => sentence.trim().length > 0).length;
  const lengthScore = Math.min(70, words.length * 4);
  const structureScore = Math.min(20, sentenceCount * 10);
  const capitalizationScore = /^[A-Z]/.test(trimmedAnswer) ? 5 : 0;
  const punctuationScore = /[.!?]$/.test(trimmedAnswer) ? 5 : 0;
  const overallScore = Math.max(
    40,
    Math.min(100, lengthScore + structureScore + capitalizationScore + punctuationScore)
  );
  const accuracy = overallScore / 100;

  return {
    ...base,
    overallScore,
    exactAccuracy: accuracy,
    wordAccuracy: accuracy,
    spellingAccuracy: accuracy,
    contentWordAccuracy: accuracy,
    functionWordAccuracy: accuracy,
  };
}
// ── Function words list (common English) ─────────────

const FUNCTION_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
  "for", "of", "with", "by", "from", "as", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do",
  "does", "did", "will", "would", "can", "could", "may", "might",
  "shall", "should", "not", "no", "nor", "so", "if", "then",
  "than", "that", "this", "these", "those", "it", "its", "he",
  "she", "they", "them", "we", "you", "my", "your", "his", "her",
  "our", "their", "me", "him", "us", "up", "down", "out", "off",
  "over", "under", "about", "into", "through", "during", "before",
  "after", "above", "below", "between", "very", "just", "also",
  "too", "only", "quite", "some", "any", "each", "every", "all",
  "both", "few", "more", "most", "other", "such", "what", "which",
  "who", "whom", "when", "where", "why", "how",
]);

export function isFunctionWord(word: string): boolean {
  return FUNCTION_WORDS.has(word.toLowerCase());
}

// ── Word-level diff ──────────────────────────────────

export function computeWordDiff(
  expected: string[],
  actual: string[]
): WordDiff[] {
  const diffs: WordDiff[] = [];
  const lcs = longestCommonSubsequence(expected, actual);

  let ei = 0;
  let ai = 0;
  let li = 0;
  let position = 0;

  while (ei < expected.length || ai < actual.length) {
    const lcsToken = li < lcs.length ? lcs[li] : null;
    const expectedToken = ei < expected.length ? expected[ei] : null;
    const actualToken = ai < actual.length ? actual[ai] : null;

    if (expectedToken === lcsToken && actualToken === lcsToken) {
      // Exact match
      diffs.push({ type: "CORRECT", expected: expectedToken, actual: actualToken, position });
      ei++;
      ai++;
      li++;
    } else if (expectedToken === lcsToken) {
      // Extra word in actual
      diffs.push({ type: "EXTRA", expected: null, actual: actualToken, position });
      ai++;
    } else if (actualToken === lcsToken) {
      // Missing word in actual
      diffs.push({ type: "MISSING", expected: expectedToken, actual: null, position });
      ei++;
    } else {
      // Both exist but don't match LCS — check spelling
      if (expectedToken && actualToken) {
        const levDist = normalizedLevenshtein(expectedToken, actualToken);
        if (levDist <= SPELLING_LEVENSHTEIN_THRESHOLD) {
          diffs.push({ type: "SPELLING", expected: expectedToken, actual: actualToken, position });
        } else {
          diffs.push({ type: "SUBSTITUTION", expected: expectedToken, actual: actualToken, position });
        }
      } else if (expectedToken) {
        diffs.push({ type: "MISSING", expected: expectedToken, actual: null, position });
      } else if (actualToken) {
        diffs.push({ type: "EXTRA", expected: null, actual: actualToken, position });
      }
      if (expectedToken) ei++;
      if (actualToken) ai++;
      // Don't advance li since neither matched LCS
    }
    position++;
  }

  return diffs;
}

// ── Error Classification ─────────────────────────────

export function classifyErrors(
  diffs: WordDiff[],
  _expectedTokens: string[],
  _actualTokens: string[]
): AssessmentError[] {
  const errors: AssessmentError[] = [];

  for (const diff of diffs) {
    switch (diff.type) {
      case "CORRECT":
        break;
      case "MISSING": {
        const expected = diff.expected!;
        errors.push({
          type: isFunctionWord(expected) ? "FUNCTION_WORD" : "MISSING_WORD",
          expected,
          actual: null,
          position: diff.position,
          confidence: 0.95,
        });
        break;
      }
      case "EXTRA":
        errors.push({
          type: "EXTRA_WORD",
          expected: "",
          actual: diff.actual!,
          position: diff.position,
          confidence: 0.9,
        });
        break;
      case "SPELLING":
        errors.push({
          type: "SPELLING",
          expected: diff.expected!,
          actual: diff.actual!,
          position: diff.position,
          confidence: 0.85,
        });
        break;
      case "SUBSTITUTION": {
        const expected = diff.expected!;
        const actual = diff.actual!;
        // Try to classify
        if (isFunctionWord(expected) && isFunctionWord(actual)) {
          errors.push({
            type: "FUNCTION_WORD",
            expected,
            actual,
            position: diff.position,
            confidence: 0.8,
          });
        } else {
          errors.push({
            type: "VOCABULARY",
            expected,
            actual,
            position: diff.position,
            confidence: 0.7,
          });
        }
        break;
      }
    }
  }

  return errors;
}

// ── Scoring ──────────────────────────────────────────

export interface ScoreResult {
  overallScore: number;
  exactAccuracy: number;
  wordAccuracy: number;
  spellingAccuracy: number;
  contentWordAccuracy: number;
  functionWordAccuracy: number;
}

export function calculateScores(
  diffs: WordDiff[],
  expectedTokens: string[],
  actualTokens: string[]
): ScoreResult {
  if (expectedTokens.length === 0) {
    return {
      overallScore: 100,
      exactAccuracy: 1,
      wordAccuracy: 1,
      spellingAccuracy: 1,
      contentWordAccuracy: 1,
      functionWordAccuracy: 1,
    };
  }

  const correctCount = diffs.filter((d) => d.type === "CORRECT").length;
  const spellingCount = diffs.filter((d) => d.type === "SPELLING").length;
  const missingCount = diffs.filter((d) => d.type === "MISSING").length;
  const extraCount = diffs.filter((d) => d.type === "EXTRA").length;
  const substitutionCount = diffs.filter((d) => d.type === "SUBSTITUTION").length;

  // Exact accuracy: percentage of tokens exactly correct
  const exactAccuracy = correctCount / expectedTokens.length;

  // Word accuracy: (correct - substitutions - extra) / max(expected, actual)
  const wordAccuracy = Math.max(
    0,
    (correctCount - substitutionCount - extraCount) /
      Math.max(expectedTokens.length, actualTokens.length, 1)
  );

  // Spelling accuracy: (correct + spelling correct) / expected
  const spellingAccuracy =
    (correctCount + spellingCount) / expectedTokens.length;

  // Content vs function word accuracy
  let contentCorrect = 0;
  let contentTotal = 0;
  let functionCorrect = 0;
  let functionTotal = 0;

  for (const diff of diffs) {
    if (diff.type === "EXTRA") continue;
    if (!diff.expected) continue;
    if (isFunctionWord(diff.expected)) {
      functionTotal++;
      if (diff.type === "CORRECT" || diff.type === "SPELLING") functionCorrect++;
    } else {
      contentTotal++;
      if (diff.type === "CORRECT" || diff.type === "SPELLING") contentCorrect++;
    }
  }

  const contentWordAccuracy = contentTotal > 0 ? contentCorrect / contentTotal : 1;
  const functionWordAccuracy = functionTotal > 0 ? functionCorrect / functionTotal : 1;

  // Overall score (0-100)
  const overallScore = Math.round(
    exactAccuracy * 40 + wordAccuracy * 30 + spellingAccuracy * 30
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    exactAccuracy,
    wordAccuracy,
    spellingAccuracy,
    contentWordAccuracy,
    functionWordAccuracy,
  };
}

// ── Main Assessment Function ─────────────────────────

export function assessDictation(
  expected: string,
  actual: string,
  options?: { normalizeOptions?: Parameters<typeof normalizeText>[1]; vocabularyMap?: Map<string, string> }
): AssessmentResult {
  const normalizedExpected = normalizeText(expected, options?.normalizeOptions);
  const normalizedActual = normalizeText(actual, options?.normalizeOptions);

  const expectedTokens = tokenize(normalizedExpected);
  const actualTokens = tokenize(normalizedActual);

  const wordDiffs = computeWordDiff(expectedTokens, actualTokens);
  const errors = classifyErrors(wordDiffs, expectedTokens, actualTokens);
  const scores = calculateScores(wordDiffs, expectedTokens, actualTokens);

  const correctTokens = wordDiffs
    .filter((d) => d.type === "CORRECT")
    .map((d) => d.expected!)
    .filter(Boolean);

  return {
    ...scores,
    correctTokens,
    wordDiffs,
    errors,
    normalizedExpected,
    normalizedActual,
  };
}
