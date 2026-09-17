import { processReview } from "@/core/srs/sm2";
import {
  applySkillMasteryUpdate,
  SKILL_MASTERY_DEFAULT,
} from "@/core/learner-model/skill-mastery";

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

/**
 * Game skill mastery step: the unified Plan13 §8 formula with source "game"
 * (alpha 0.18). `difficulty` defaults to 1 for callers that have no run.
 */
export function nextSkillMastery(input: {
  existingScore?: number;
  score: number;
  difficulty?: number;
}) {
  return applySkillMasteryUpdate({
    old: input.existingScore ?? SKILL_MASTERY_DEFAULT,
    score: input.score,
    difficulty: input.difficulty ?? 1,
    source: "game",
  });
}

export { processReview };

