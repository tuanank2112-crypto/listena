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
  if (input.code === "START_IN_PROGRESS" || input.transportFailure === true) return true;
  // A typed 5xx (AI_UNAVAILABLE, AI_RATE_LIMITED, DATABASE_UNAVAILABLE...) is
  // already a FAILED ledger row for this key: replaying it only repeats the
  // same answer, so the learner gets the message and a fresh key instead.
  if (shouldDiscardSessionStartId(input.code)) return false;
  return typeof input.status === "number" && input.status >= 500;
}

/** Keep in-progress retry feedback responsive even if a malformed header leaks through. */
export function startRetryDelayMs(retryAfterSeconds?: number) {
  const seconds = Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0
    ? Math.ceil(retryAfterSeconds!)
    : 2;
  return Math.min(5_000, Math.max(250, seconds * 1_000));
}

/**
 * A new browser action is required after terminal, non-ambiguous outcomes.
 * Plan13 SPEC-P131 §2 turned every pre-provider and provider-thrown failure
 * into a FAILED ledger row, so each of these codes is safe to retry with a
 * fresh clientStartId; only START_OUTCOME_UNKNOWN keeps the explicit warning.
 */
export function shouldDiscardSessionStartId(code?: string) {
  return [
    "AI_UNAVAILABLE",
    "AI_MISCONFIGURED",
    "AI_RATE_LIMITED",
    "AI_REQUEST_LIMIT",
    "IDEMPOTENCY_CONFLICT",
    "INVALID_INPUT",
    "TARGET_UNAVAILABLE",
    "ACTIVE_SESSION_EXISTS",
    "MIGRATION_WRITE_DISABLED",
    "START_FAILED",
    "DATABASE_UNAVAILABLE",
  ].includes(code ?? "");
}

/**
 * Plan13 SPEC-P131 §3: an ACTIVE_SESSION_EXISTS answer that names the open
 * session is not a dead end. The button offers "resume" (a link) and "start a
 * new session" (the same request with `replaceActive: true`).
 */
export function offersActiveSessionChoice(input: {
  code?: string;
  activeSessionId?: string;
}): input is { code: "ACTIVE_SESSION_EXISTS"; activeSessionId: string } {
  return input.code === "ACTIVE_SESSION_EXISTS"
    && typeof input.activeSessionId === "string"
    && input.activeSessionId.length > 0;
}
