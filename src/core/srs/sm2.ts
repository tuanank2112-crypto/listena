/**
 * Spaced Repetition System (SM-2 simplified).
 * Pure deterministic functions.
 */

import {
  SM2_INITIAL_EASE,
  SM2_MIN_EASE,
  SM2_EASE_AGAIN_DELTA,
  SM2_EASE_HARD_DELTA,
  SM2_EASE_GOOD_DELTA,
  SM2_EASE_EASY_DELTA,
  SM2_INTERVAL_AGAIN_MINUTES,
  SM2_INTERVAL_HARD_HOURS,
  SM2_INTERVAL_GOOD_DAYS,
  SM2_INTERVAL_EASY_DAYS,
} from "../constants";

export type CardRating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export interface ReviewInput {
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  rating: CardRating;
  previousInterval?: number;
}

export interface ReviewResult {
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date;
}

/**
 * Simplified SM-2 algorithm.
 *
 * AGAIN: Reset to 0, next review in 10 minutes, ease -0.2
 * HARD:  Keep interval, next review in 1 hour, ease -0.15
 * GOOD:  Normal interval increase, next review in 1 day, ease unchanged
 * EASY:  Bonus interval, next review in 3 days, ease +0.15
 *
 * Ease factor is clamped to SM2_MIN_EASE minimum.
 * Interval is multiplied by ease factor for subsequent reviews.
 */
export function processReview(input: ReviewInput): ReviewResult {
  const now = new Date();
  let { repetitionCount, intervalDays, easeFactor } = input;

  // Update ease factor based on rating
  switch (input.rating) {
    case "AGAIN":
      easeFactor = Math.max(SM2_MIN_EASE, easeFactor + SM2_EASE_AGAIN_DELTA);
      repetitionCount = 0;
      intervalDays = 0; // Will be set to minutes below
      break;
    case "HARD":
      easeFactor = Math.max(SM2_MIN_EASE, easeFactor + SM2_EASE_HARD_DELTA);
      repetitionCount += 1;
      // Keep interval roughly the same
      intervalDays = Math.max(intervalDays, SM2_INTERVAL_HARD_HOURS / 24);
      break;
    case "GOOD":
      easeFactor = Math.max(SM2_MIN_EASE, easeFactor + SM2_EASE_GOOD_DELTA);
      repetitionCount += 1;
      if (repetitionCount === 1) {
        intervalDays = SM2_INTERVAL_GOOD_DAYS;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor * 10) / 10;
      }
      break;
    case "EASY":
      easeFactor = Math.max(SM2_MIN_EASE, easeFactor + SM2_EASE_EASY_DELTA);
      repetitionCount += 1;
      if (repetitionCount === 1) {
        intervalDays = SM2_INTERVAL_EASY_DAYS;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor * 1.5 * 10) / 10;
      }
      break;
  }

  // Calculate next review time
  const nextReviewAt = new Date(now);

  if (input.rating === "AGAIN") {
    // For AGAIN, review in minutes
    nextReviewAt.setMinutes(nextReviewAt.getMinutes() + SM2_INTERVAL_AGAIN_MINUTES);
    intervalDays = SM2_INTERVAL_AGAIN_MINUTES / (24 * 60); // store as fraction of day
  } else if (input.rating === "HARD" && repetitionCount === 1) {
    nextReviewAt.setHours(nextReviewAt.getHours() + SM2_INTERVAL_HARD_HOURS);
    intervalDays = SM2_INTERVAL_HARD_HOURS / 24;
  } else {
    nextReviewAt.setDate(nextReviewAt.getDate() + Math.ceil(intervalDays));
    intervalDays = Math.ceil(intervalDays);
  }

  // Ensure we never schedule in the past
  if (nextReviewAt <= now) {
    nextReviewAt.setHours(nextReviewAt.getHours() + 1);
  }

  return {
    repetitionCount,
    intervalDays,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReviewAt,
  };
}
