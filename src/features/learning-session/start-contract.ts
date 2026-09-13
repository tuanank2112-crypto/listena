/** Browser-only policy for a durable POST /learning-sessions start key. */
export const MAX_AUTOMATIC_START_RETRIES = 5;

type StartRetryInput = {
  attempt: number;
  code?: string;
  status?: number;
  transportFailure?: boolean;
};

/**
 * Repeating an ambiguous request is safe only with the same clientStartId.
 * We bound automatic retries so a learner always regains a manual control.
 */
export function shouldRetrySessionStart(input: StartRetryInput) {
  if (input.attempt >= MAX_AUTOMATIC_START_RETRIES) return false;
  return input.code === "START_IN_PROGRESS"
    || input.transportFailure === true
    || (typeof input.status === "number" && input.status >= 500);
}

/** Keep in-progress retry feedback responsive even if a malformed header leaks through. */
export function startRetryDelayMs(retryAfterSeconds?: number) {
  const seconds = Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0
    ? Math.ceil(retryAfterSeconds!)
    : 2;
  return Math.min(5_000, Math.max(250, seconds * 1_000));
}

/** A new browser action is required after terminal, non-ambiguous outcomes. */
export function shouldDiscardSessionStartId(code?: string) {
  return [
    "AI_UNAVAILABLE",
    "AI_REQUEST_LIMIT",
    "IDEMPOTENCY_CONFLICT",
    "INVALID_INPUT",
    "TARGET_UNAVAILABLE",
    "ACTIVE_SESSION_EXISTS",
    "MIGRATION_WRITE_DISABLED",
    "START_FAILED",
  ].includes(code ?? "");
}
