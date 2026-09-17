import { randomUUID } from "node:crypto";
import { accountActionUrl, type AccountEmailRecipient } from "@/server/account-email";
import { createConfiguredEmailDelivery } from "./resend";
import { renderAccountExistsEmail } from "./templates";

/**
 * Companion to `sendPasswordResetEmail`/`sendVerificationEmail` for the
 * register route (Plan13 A3): an existing, verified account receives a reset
 * link instead of the caller receiving a 409. Imported directly rather than
 * through the package index to keep `account-email` -> `email` acyclic.
 */
export async function sendAccountExistsEmail(input: {
  requestUrl: string;
  recipient: AccountEmailRecipient;
  rawToken: string;
}) {
  const delivery = createConfiguredEmailDelivery();
  await delivery.send(renderAccountExistsEmail({
    to: input.recipient.email,
    recipientName: input.recipient.name,
    resetUrl: accountActionUrl({
      requestUrl: input.requestUrl,
      path: "/reset-password",
      rawToken: input.rawToken,
    }),
    idempotencyKey: `account-exists-${input.recipient.id}-${randomUUID()}`,
  }));
}
