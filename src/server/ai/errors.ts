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
  | "schema_validation_failed";

export interface AIProviderErrorOptions {
  reason: AIProviderFailureReason;
  provider?: string;
  model?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export class AIProviderError extends Error {
  readonly status = 503;

  constructor(
    readonly code: "AI_UNAVAILABLE" | "AI_RATE_LIMITED",
    message: string,
    readonly details: AIProviderErrorOptions,
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

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
