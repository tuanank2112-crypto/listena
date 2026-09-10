/**
 * Safe, caller-facing errors for a live AI provider.
 *
 * `reason` is deliberately a small, internal classification rather than an
 * upstream response body. It is safe to log, but it must not contain a key,
 * prompt, or learner content.
 */
export type AIProviderFailureReason =
  | "provider_not_configured"
  | "invalid_provider_configuration"
  | "upstream_unauthorized"
  | "rate_limited"
  | "upstream_failure"
  | "network_failure"
  | "timeout"
  | "invalid_input"
  | "invalid_response"
  | "invalid_json"
  | "schema_validation_failed"
  | "app_request_limited";

export interface AIProviderErrorOptions {
  reason: AIProviderFailureReason;
  provider?: string;
  model?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export class AIProviderError extends Error {
  constructor(
    readonly code: "AI_UNAVAILABLE" | "AI_RATE_LIMITED" | "AI_REQUEST_LIMIT",
    message: string,
    readonly details: AIProviderErrorOptions,
    readonly status = 503,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class AIUnavailableError extends AIProviderError {
  constructor(options: Omit<AIProviderErrorOptions, "retryAfterSeconds">) {
    super(
      "AI_UNAVAILABLE",
      "Gia sư AI hiện chưa sẵn sàng. Vui lòng thử lại sau.",
      options,
    );
    this.name = "AIUnavailableError";
  }
}

export class AIRateLimitedError extends AIProviderError {
  constructor(options: AIProviderErrorOptions) {
    super(
      "AI_RATE_LIMITED",
      "Gia sư AI đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
      options,
    );
    this.name = "AIRateLimitedError";
  }
}

/**
 * A local, durable per-user guard. This is distinct from an upstream 429:
 * the caller may safely surface the bounded wait as HTTP 429 without exposing
 * any provider response or credential metadata.
 */
export class AIRequestBudgetError extends AIProviderError {
  constructor(input: {
    reason: "ACTIVE" | "COOLDOWN" | "DAILY_LIMIT";
    retryAfterSeconds: number;
  }) {
    super(
      "AI_REQUEST_LIMIT",
      input.reason === "DAILY_LIMIT"
        ? "Bạn đã dùng hết lượt AI trong 24 giờ. Hãy học các bài hiện có rồi thử lại sau."
        : "Bạn vừa gửi một yêu cầu AI. Vui lòng chờ một chút trước khi tiếp tục.",
      {
        reason: "app_request_limited",
        retryAfterSeconds: input.retryAfterSeconds,
      },
      429,
    );
    this.name = "AIRequestBudgetError";
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
