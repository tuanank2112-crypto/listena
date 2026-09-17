export class LearningSessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    /** Extra, navigation-safe fields merged into the JSON error body. */
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LearningSessionError";
  }
}

export class LearningSessionNotFoundError extends LearningSessionError {
  constructor() {
    super("Learning session not found", "SESSION_NOT_FOUND", 404);
  }
}

export class LearningSessionTargetUnavailableError extends LearningSessionError {
  constructor() {
    super(
      "The selected learning target is unavailable",
      "TARGET_UNAVAILABLE",
      404,
    );
  }
}

/**
 * A learner must finish or explicitly abandon the current primary session first.
 * `activeSessionId` lets the client offer "resume" and "start a new session"
 * (Plan13 SPEC-P131 §3) instead of a dead end.
 */
export class LearningSessionActiveConflictError extends LearningSessionError {
  constructor(readonly activeSessionId?: string) {
    super(
      "Finish or resume the current learning session before starting another one",
      "ACTIVE_SESSION_EXISTS",
      409,
      undefined,
      activeSessionId ? { activeSessionId } : undefined,
    );
  }
}

/** Plan13 SPEC-P132 §9: at most 200 PAUSE/RESUME/HINT/REPLAY rows per session. */
export class LearningSessionEventLimitError extends LearningSessionError {
  constructor() {
    super(
      "This session has recorded its maximum number of events",
      "EVENT_LIMIT",
      429,
      60,
    );
  }
}

export class LearningSessionConflictError extends LearningSessionError {
  constructor(message = "Learning session changed; retry the request") {
    super(message, "SESSION_CONFLICT", 409);
  }
}

export class LearningSessionIdempotencyConflictError extends LearningSessionError {
  constructor() {
    super(
      "This start key was already used with different session details",
      "IDEMPOTENCY_CONFLICT",
      409,
    );
  }
}

export class LearningSessionStartInProgressError extends LearningSessionError {
  constructor(retryAfterSeconds = 2) {
    super(
      "This learning session is still being prepared",
      "START_IN_PROGRESS",
      409,
      retryAfterSeconds,
    );
  }
}

export class LearningSessionStartOutcomeUnknownError extends LearningSessionError {
  constructor() {
    super(
      "The previous start request has an unknown outcome. Start a new session to continue.",
      "START_OUTCOME_UNKNOWN",
      409,
    );
  }
}

export class LearningSessionStartFailedError extends LearningSessionError {
  constructor(retryAfterSeconds?: number) {
    super(
      "This start request already failed before a session was created. Start a new session to continue.",
      "START_FAILED",
      409,
      retryAfterSeconds,
    );
  }
}

export class LearningSessionValidationError extends LearningSessionError {
  constructor(message: string, code = "INVALID_SESSION_REQUEST") {
    super(message, code, 400);
  }
}
