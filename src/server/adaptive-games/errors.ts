export type AdaptiveGameErrorCode =
  | "PRIVATE_NOT_FOUND"
  | "GAME_CONFLICT"
  | "GAME_RATE_LIMIT"
  | "VALIDATION_ERROR";

export class AdaptiveGameError extends Error {
  constructor(
    message: string,
    readonly code: AdaptiveGameErrorCode,
    readonly status: 400 | 404 | 409 | 429,
  ) {
    super(message);
    this.name = "AdaptiveGameError";
  }
}

export class AdaptiveGamePrivateNotFoundError extends AdaptiveGameError {
  constructor() {
    // Intentionally do not distinguish a foreign resource from an absent one.
    super("Game run or round was not found", "PRIVATE_NOT_FOUND", 404);
    this.name = "AdaptiveGamePrivateNotFoundError";
  }
}

export class AdaptiveGameConflictError extends AdaptiveGameError {
  constructor(message = "This game run can no longer accept that answer") {
    super(message, "GAME_CONFLICT", 409);
    this.name = "AdaptiveGameConflictError";
  }
}

export class AdaptiveGameRateLimitError extends AdaptiveGameError {
  constructor(
    readonly retryAfterSeconds: number,
    message = "Bạn đang tạo lượt game quá nhanh. Hãy thử lại sau.",
  ) {
    super(message, "GAME_RATE_LIMIT", 429);
    this.name = "AdaptiveGameRateLimitError";
  }
}
