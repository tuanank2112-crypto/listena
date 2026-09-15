import type { EmailDelivery, EmailDeliveryResult, OutboundEmail } from "./contracts";
import {
  EmailDeliveryUnavailableError,
  type EmailDeliveryFailureReason,
} from "./errors";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_TIMEOUT_MS = 30_000;

export type EmailDeliveryEnvironment = {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
};

type ResendEmailDeliveryConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
  timeoutMs?: number;
};

/**
 * Reads only server-side variables. `RESEND_API_KEY` and sender values never
 * cross the provider-neutral email contract or enter a client bundle.
 */
export function createConfiguredEmailDelivery(
  env: EmailDeliveryEnvironment = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  },
): EmailDelivery {
  const provider = optionalConfig(env.EMAIL_PROVIDER);
  if (provider && provider.toLowerCase() !== "resend") {
    throw unavailable("invalid_provider_configuration");
  }

  const apiKey = requiredConfig(env.RESEND_API_KEY);
  const from = requiredConfig(env.EMAIL_FROM);
  const replyTo = optionalConfig(env.EMAIL_REPLY_TO);

  if (!isSenderAddress(from) || (replyTo && !isMailbox(replyTo))) {
    throw unavailable("invalid_provider_configuration");
  }

  return new ResendEmailDelivery({ apiKey, from, replyTo });
}

export class ResendEmailDelivery implements EmailDelivery {
  private readonly timeoutMs: number;

  constructor(private readonly config: ResendEmailDeliveryConfig) {
    if (!nonBlank(config.apiKey) || !isSenderAddress(config.from)) {
      throw unavailable("invalid_provider_configuration");
    }
    if (config.replyTo && !isMailbox(config.replyTo)) {
      throw unavailable("invalid_provider_configuration");
    }
    this.timeoutMs = Math.min(
      Math.max(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
      MAX_TIMEOUT_MS,
    );
  }

  async send(email: OutboundEmail): Promise<EmailDeliveryResult> {
    validateOutboundEmail(email);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(RESEND_EMAILS_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            ...(email.idempotencyKey
              ? { "Idempotency-Key": email.idempotencyKey }
              : {}),
          },
          body: JSON.stringify({
            from: this.config.from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
            ...(email.replyTo ?? this.config.replyTo
              ? { reply_to: email.replyTo ?? this.config.replyTo }
              : {}),
          }),
          // Never follow an untrusted redirect after attaching the API key.
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        throw unavailable(timedOut ? "timeout" : "network_failure");
      }

      if (!response.ok) {
        throw unavailable(failureReasonForStatus(response.status));
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw unavailable("invalid_response");
      }

      const messageId = responseId(payload);
      if (!messageId) {
        throw unavailable("invalid_response");
      }

      return { provider: "resend", messageId };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requiredConfig(value: string | undefined) {
  const normalized = nonBlank(value);
  if (!normalized) throw unavailable("provider_not_configured");
  return normalized;
}

function optionalConfig(value: string | undefined) {
  return nonBlank(value);
}

function nonBlank(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isMailbox(value: string) {
  return !/[\r\n]/.test(value)
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function isSenderAddress(value: string) {
  if (isMailbox(value)) return true;
  const match = /^(?:[^<>\r\n]+)\s*<([^<>\s]+)>$/.exec(value);
  return Boolean(match?.[1] && isMailbox(match[1]));
}

function validateOutboundEmail(email: OutboundEmail) {
  if (
    !isMailbox(email.to)
    || !nonBlank(email.subject)
    || email.subject.length > 200
    || !nonBlank(email.html)
    || !nonBlank(email.text)
    || (email.replyTo !== undefined && !isMailbox(email.replyTo))
    || (email.idempotencyKey !== undefined && !isSafeIdempotencyKey(email.idempotencyKey))
  ) {
    throw unavailable("invalid_message");
  }
}

function isSafeIdempotencyKey(value: string) {
  return value.length > 0 && value.length <= 256 && !/[\r\n]/.test(value);
}

function failureReasonForStatus(status: number): EmailDeliveryFailureReason {
  if (status === 401 || status === 403) return "upstream_unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream_failure";
}

function responseId(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("id" in payload)) {
    return undefined;
  }
  const id = (payload as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : undefined;
}

function unavailable(reason: EmailDeliveryFailureReason) {
  return new EmailDeliveryUnavailableError({ reason });
}
