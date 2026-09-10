export const PERSONALIZED_LESSON_MIN_INTERVAL_MS = 5 * 60 * 1_000;
export const PERSONALIZED_LESSON_DAILY_LIMIT = 8;
export const PERSONALIZED_LESSON_ACTIVE_WINDOW_MS = 90 * 1_000;

export type PersonalizationBudgetDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; reason: "ACTIVE" | "COOLDOWN" | "DAILY_LIMIT" };

/**
 * A small, deterministic cost guard around live lesson generation. Reusing a
 * READY lesson never reaches this guard; it applies only before a new upstream
 * request is started.
 */
export function evaluatePersonalizationBudget(input: {
  now: Date;
  activeGenerationCreatedAt?: Date | null;
  successfulGenerationTimes: Date[];
}): PersonalizationBudgetDecision {
  const { now, activeGenerationCreatedAt } = input;
  if (activeGenerationCreatedAt) {
    const activeAge = now.getTime() - activeGenerationCreatedAt.getTime();
    if (activeAge < PERSONALIZED_LESSON_ACTIVE_WINDOW_MS) {
      return {
        allowed: false,
        reason: "ACTIVE",
        retryAfterSeconds: retryAfter(PERSONALIZED_LESSON_ACTIVE_WINDOW_MS - activeAge),
      };
    }
  }

  const dayStart = now.getTime() - 24 * 60 * 60 * 1_000;
  const withinDay = input.successfulGenerationTimes.filter(
    (createdAt) => createdAt.getTime() >= dayStart,
  );
  if (withinDay.length >= PERSONALIZED_LESSON_DAILY_LIMIT) {
    const oldestAllowed = Math.min(...withinDay.map((createdAt) => createdAt.getTime()));
    return {
      allowed: false,
      reason: "DAILY_LIMIT",
      retryAfterSeconds: retryAfter(oldestAllowed + 24 * 60 * 60 * 1_000 - now.getTime()),
    };
  }

  const mostRecent = Math.max(...withinDay.map((createdAt) => createdAt.getTime()), Number.NEGATIVE_INFINITY);
  if (Number.isFinite(mostRecent)) {
    const elapsed = now.getTime() - mostRecent;
    if (elapsed < PERSONALIZED_LESSON_MIN_INTERVAL_MS) {
      return {
        allowed: false,
        reason: "COOLDOWN",
        retryAfterSeconds: retryAfter(PERSONALIZED_LESSON_MIN_INTERVAL_MS - elapsed),
      };
    }
  }

  return { allowed: true };
}

function retryAfter(milliseconds: number) {
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}
