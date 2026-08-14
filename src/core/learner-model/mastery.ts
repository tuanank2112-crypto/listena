/**
 * Learner model: mastery score updates.
 * Pure deterministic functions.
 */

import {
  MASTERY_OLD_WEIGHT,
  MASTERY_NEW_WEIGHT,
  HINT_PENALTY,
  REPLAY_PENALTY_PER_REPLAY,
  MAX_REPLAY_PENALTY,
  MASTERY_MIN,
  MASTERY_MAX,
  MASTERY_INITIAL,
} from "../constants";

export interface MasteryUpdateInput {
  oldMastery: number;
  attemptScore: number; // 0-1
  hintCount: number;
  replayCount: number;
  difficulty?: number; // 0.5-2.0, higher = harder
}

export interface MasteryUpdateResult {
  newMastery: number;
  delta: number;
  evidenceCount: number;
}

/**
 * Update mastery score for a skill or vocabulary item.
 *
 * Formula:
 *   newMastery = clamp(
 *     oldMastery * MASTERY_OLD_WEIGHT +
 *     attemptPerformance * MASTERY_NEW_WEIGHT -
 *     hintPenalty -
 *     replayPenalty,
 *     MASTERY_MIN,
 *     MASTERY_MAX
 *   )
 *
 * Where:
 *   attemptPerformance = attemptScore * (1 / difficulty)
 *   hintPenalty = HINT_PENALTY * hintCount
 *   replayPenalty = min(REPLAY_PENALTY_PER_REPLAY * replayCount, MAX_REPLAY_PENALTY)
 *
 * The formula ensures:
 * - Mastery changes gradually (80% old, 20% new)
 * - Hints and replays have small but bounded penalties
 * - Mastery stays in [0, 1]
 */
export function updateMastery(input: MasteryUpdateInput): MasteryUpdateResult {
  const difficulty = input.difficulty ?? 1.0;
  const attemptPerformance = input.attemptScore * (1 / difficulty);
  const hintPenalty = HINT_PENALTY * input.hintCount;
  const replayPenalty = Math.min(
    REPLAY_PENALTY_PER_REPLAY * input.replayCount,
    MAX_REPLAY_PENALTY
  );

  const newMastery = Math.min(
    MASTERY_MAX,
    Math.max(
      MASTERY_MIN,
      input.oldMastery * MASTERY_OLD_WEIGHT +
        attemptPerformance * MASTERY_NEW_WEIGHT -
        hintPenalty -
        replayPenalty
    )
  );

  const delta = newMastery - input.oldMastery;

  return {
    newMastery: Math.round(newMastery * 1000) / 1000, // round to 3 decimals
    delta: Math.round(delta * 1000) / 1000,
    evidenceCount: 1,
  };
}

export function getInitialMastery(): number {
  return MASTERY_INITIAL;
}

/**
 * Calculate how multiple exercise types contribute to overall skill mastery.
 */
export function combinedListeningMastery(
  spellingMastery: number,
  vocabularyMastery: number,
  segmentationMastery: number
): number {
  return Math.round(
    (spellingMastery * 0.3 + vocabularyMastery * 0.4 + segmentationMastery * 0.3) * 1000
  ) / 1000;
}
