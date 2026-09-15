/**
 * Provider-neutral input for a transactional email. Route handlers create one
 * through a template helper; provider credentials stay inside the delivery
 * implementation.
 */
export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** A durable request or outbox identifier, never an authentication token. */
  idempotencyKey?: string;
}

export interface EmailDeliveryResult {
  provider: "resend";
  messageId: string;
}

export interface EmailDelivery {
  send(email: OutboundEmail): Promise<EmailDeliveryResult>;
}
