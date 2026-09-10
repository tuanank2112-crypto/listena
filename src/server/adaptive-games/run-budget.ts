export const GAME_RUN_MIN_INTERVAL_MS = 10 * 1_000;
export const GAME_RUN_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const GAME_RUN_ROLLING_LIMIT = 12;

export type GameRunRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "COOLDOWN" | "ROLLING_LIMIT";
      retryAfterSeconds: number;
    };

/**
 * Decides whether a server is allowed to issue a fresh adaptive-game run.
 *
 * `freshRunStartedAt` is durable server-owned history. It deliberately does
 * not accept a mode, run id, status, or any browser-provided timestamp, so a
 * learner cannot evade the quota by changing the game form or retrying an
 * answer request.
 */
export function evaluateGameRunRateLimit(input: {
  now: Date;
  freshRunStartedAt: Date[];
}): GameRunRateLimitDecision {
  const nowMs = input.now.getTime();
  const windowStartMs = nowMs - GAME_RUN_ROLLING_WINDOW_MS;
  const withinWindow = input.freshRunStartedAt
    .map((startedAt) => startedAt.getTime())
    .filter((startedAtMs) => Number.isFinite(startedAtMs) && startedAtMs > windowStartMs)
    .sort((left, right) => right - left);

  const waits: Array<{
    reason: "COOLDOWN" | "ROLLING_LIMIT";
    milliseconds: number;
  }> = [];

  if (withinWindow.length >= GAME_RUN_ROLLING_LIMIT) {
    // In production the reader already returns the newest twelve rows. Keep
    // the pure helper correct when a caller gives it a larger history too.
    const oldestAllowed = withinWindow[GAME_RUN_ROLLING_LIMIT - 1]!;
    waits.push({
      reason: "ROLLING_LIMIT",
      milliseconds: oldestAllowed + GAME_RUN_ROLLING_WINDOW_MS - nowMs,
    });
  }

  const newestInWindow = withinWindow[0] ?? Number.NEGATIVE_INFINITY;
  if (Number.isFinite(newestInWindow)) {
    const elapsed = nowMs - newestInWindow;
    if (elapsed < GAME_RUN_MIN_INTERVAL_MS) {
      waits.push({
        reason: "COOLDOWN",
        milliseconds: GAME_RUN_MIN_INTERVAL_MS - elapsed,
      });
    }
  }

  if (waits.length === 0) return { allowed: true };

  // Return the later unblock time. This prevents an automatic client retry
  // from immediately colliding with the other guard when both apply.
  const strictestWait = waits.reduce((longest, candidate) => (
    candidate.milliseconds > longest.milliseconds ? candidate : longest
  ));
  return {
    allowed: false,
    reason: strictestWait.reason,
    retryAfterSeconds: retryAfter(strictestWait.milliseconds),
  };
}

function retryAfter(milliseconds: number) {
  // A bad/forward server clock must not turn a response header into an
  // unbounded retry delay. The normal maximum is one rolling window.
  return Math.max(
    1,
    Math.min(
      Math.ceil(milliseconds / 1_000),
      Math.ceil(GAME_RUN_ROLLING_WINDOW_MS / 1_000),
    ),
  );
}
