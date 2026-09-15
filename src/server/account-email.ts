import { randomUUID } from "node:crypto";
import {
  createConfiguredEmailDelivery,
  EmailDeliveryUnavailableError,
  renderPasswordResetEmail,
  renderVerificationEmail,
} from "@/server/email";

export type AccountEmailRecipient = {
  id: string;
  name: string | null;
  email: string;
};

type AccountActionUrlInput = {
  requestUrl: string;
  path: "/verify-email" | "/reset-password";
  rawToken: string;
};

/**
 * Creates an absolute link for a message sent by this server. A configured
 * canonical application URL takes precedence over the request host, which can
 * be an internal Vercel host behind a proxy.
 */
export function accountActionUrl(input: AccountActionUrlInput) {
  const configuredOrigin = process.env.AUTH_URL?.trim()
    || process.env.NEXTAUTH_URL?.trim()
    || input.requestUrl;

  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw unavailableConfiguration();
  }

  if (
    (origin.protocol !== "https:" && origin.protocol !== "http:")
    || !origin.hostname
    || origin.username
    || origin.password
  ) {
    throw unavailableConfiguration();
  }

  const url = new URL(input.path, origin.origin);
  url.searchParams.set("token", input.rawToken);
  return url.toString();
}

export async function sendVerificationEmail(input: {
  requestUrl: string;
  recipient: AccountEmailRecipient;
  rawToken: string;
}) {
  const delivery = createConfiguredEmailDelivery();
  await delivery.send(renderVerificationEmail({
    to: input.recipient.email,
    recipientName: input.recipient.name,
    verificationUrl: accountActionUrl({
      requestUrl: input.requestUrl,
      path: "/verify-email",
      rawToken: input.rawToken,
    }),
    idempotencyKey: `verify-${input.recipient.id}-${randomUUID()}`,
  }));
}

export async function sendPasswordResetEmail(input: {
  requestUrl: string;
  recipient: AccountEmailRecipient;
  rawToken: string;
}) {
  const delivery = createConfiguredEmailDelivery();
  await delivery.send(renderPasswordResetEmail({
    to: input.recipient.email,
    recipientName: input.recipient.name,
    resetUrl: accountActionUrl({
      requestUrl: input.requestUrl,
      path: "/reset-password",
      rawToken: input.rawToken,
    }),
    idempotencyKey: `password-reset-${input.recipient.id}-${randomUUID()}`,
  }));
}

function unavailableConfiguration() {
  return new EmailDeliveryUnavailableError({
    reason: "invalid_provider_configuration",
  });
}
