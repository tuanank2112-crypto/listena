export class LearningSessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
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

export class LearningSessionConflictError extends LearningSessionError {
  constructor(message = "Learning session changed; retry the request") {
    super(message, "SESSION_CONFLICT", 409);
  }
}

export class LearningSessionValidationError extends LearningSessionError {
  constructor(message: string, code = "INVALID_SESSION_REQUEST") {
    super(message, code, 400);
  }
}
