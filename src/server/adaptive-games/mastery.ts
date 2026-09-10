import { processReview } from "@/core/srs/sm2";

export function gameReviewRating(correct: boolean, responseTimeMs?: number) {
  if (!correct) return "AGAIN" as const;
  if (responseTimeMs === undefined) return "GOOD" as const;
  if (responseTimeMs <= 5_000) return "EASY" as const;
  if (responseTimeMs <= 15_000) return "GOOD" as const;
  return "HARD" as const;
}

export function nextVocabularyMastery(input: {
  existingScore?: number;
  correct: boolean;
}) {
  const current = input.existingScore ?? 0.3;
  const delta = input.correct ? 0.12 : -0.08;
  return Math.min(1, Math.max(0, current + delta));
}

export function nextSkillMastery(input: {
  existingScore?: number;
  score: number;
  confidence?: number;
}) {
  const current = input.existingScore ?? 0.5;
  const learningRate = 0.18 * (input.confidence ?? 1);
  return Math.min(1, Math.max(0, current + (input.score - current) * learningRate));
}

export { processReview };

