/**
 * Safe classifications for email failures. They deliberately exclude the
 * recipient, action URL, provider response body, and all credentials.
 */
export type EmailDeliveryFailureReason =
  | "provider_not_configured"
  | "invalid_provider_configuration"
  | "invalid_message"
  | "network_failure"
  | "timeout"
  | "upstream_unauthorized"
  | "rate_limited"
  | "upstream_failure"
  | "invalid_response";

export interface EmailDeliveryUnavailableOptions {
  reason: EmailDeliveryFailureReason;
  retryAfterSeconds?: number;
}

/**
 * The only error callers should surface for delivery failures. The stable code
 * lets account routes respond consistently without leaking account existence
 * or provider diagnostics.
 */
export class EmailDeliveryUnavailableError extends Error {
  readonly code = "EMAIL_DELIVERY_UNAVAILABLE" as const;
  readonly status = 503;

  constructor(readonly details: EmailDeliveryUnavailableOptions) {
    super("Dịch vụ email tạm thời chưa sẵn sàng. Vui lòng thử lại sau.");
    this.name = "EmailDeliveryUnavailableError";
  }
}

export function isEmailDeliveryUnavailableError(
  error: unknown,
): error is EmailDeliveryUnavailableError {
  return error instanceof EmailDeliveryUnavailableError;
}
