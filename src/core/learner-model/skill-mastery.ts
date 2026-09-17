/**
 * Unified SkillMastery update formula (Plan13 SPEC-P132 §8).
 *
 * Every writer of `SkillMastery.masteryScore` that reacts to a single scored
 * event (adaptive games, personalized lessons) must use this function or a SQL
 * mirror of it, so the same score moves the same skill the same way no matter
 * which surface produced it.
 *
 *   performance = clamp(score * (1 / clamp(difficulty, 0.6, 1.8)), 0, 1)
 *   alpha       = source === "game" ? 0.18 : 0.2
 *   new         = clamp(old + alpha * (performance - old), 0, 1)
 */

export type SkillMasterySource = "game" | "personalized";

export interface SkillMasteryUpdateInput {
  /** Current mastery in [0, 1]; callers pass 0.5 for a learner without a row. */
  old: number;
  /** Scored outcome in [0, 1]. */
  score: number;
  /** Item difficulty; clamped to [0.6, 1.8] before use. */
  difficulty: number;
  source: SkillMasterySource;
}

export const SKILL_MASTERY_DEFAULT = 0.5;
export const SKILL_MASTERY_ALPHA_GAME = 0.18;
export const SKILL_MASTERY_ALPHA_PERSONALIZED = 0.2;
export const SKILL_MASTERY_DIFFICULTY_MIN = 0.6;
export const SKILL_MASTERY_DIFFICULTY_MAX = 1.8;

export function clampUnit(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function skillMasteryAlpha(source: SkillMasterySource) {
  return source === "game" ? SKILL_MASTERY_ALPHA_GAME : SKILL_MASTERY_ALPHA_PERSONALIZED;
}

/** Difficulty-adjusted performance in [0, 1]; also the value SQL mirrors bind. */
export function skillMasteryPerformance(score: number, difficulty: number) {
  const boundedDifficulty = clampUnit(
    difficulty,
    SKILL_MASTERY_DIFFICULTY_MIN,
    SKILL_MASTERY_DIFFICULTY_MAX,
  );
  return clampUnit(score * (1 / boundedDifficulty), 0, 1);
}

export function applySkillMasteryUpdate(input: SkillMasteryUpdateInput): number {
  const old = clampUnit(input.old, 0, 1);
  const performance = skillMasteryPerformance(input.score, input.difficulty);
  const alpha = skillMasteryAlpha(input.source);
  return clampUnit(old + alpha * (performance - old), 0, 1);
}
