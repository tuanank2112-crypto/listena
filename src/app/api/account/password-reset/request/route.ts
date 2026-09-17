import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { issueAccountActionToken } from "@/server/account-actions";
import { sendPasswordResetEmail } from "@/server/account-email";
import { equalizePasswordWork, equalizeTokenWork, padOpaqueResponse } from "@/server/auth/opaque-response";
import { isEmailDeliveryUnavailableError } from "@/server/email";
import { AccountActionRequestSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

const acceptedResponse = () => NextResponse.json(
  { accepted: true },
  { status: 202, headers: { "Cache-Control": "no-store" } },
);

const invalidResponse = () => NextResponse.json(
  { error: "Dữ liệu không hợp lệ" },
  { status: 400, headers: { "Cache-Control": "no-store" } },
);

/**
 * Account-enumeration hardening (Plan13 A1). For any well-formed email the
 * response is decided before a single account read: status, body, headers
 * and elapsed time are identical whether or not the address is registered.
 * The lookup, token issue and mail delivery all run in `after()`. The pad
 * completes BEFORE the callback is registered, so none of the deferred work
 * can overlap the pad window (on local file-SQLite the libSQL driver is
 * synchronous and a token write during the pad delayed the flush). Both
 * branches of the callback then perform comparable database and bcrypt work.
 */
export async function POST(request: Request) {
  const startedAt = performance.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidResponse();
  }
  const parsed = AccountActionRequestSchema.safeParse(body);
  if (!parsed.success) return invalidResponse();

  const email = parsed.data.email;
  const requestUrl = request.url;
  const requestId = randomUUID();

  // Pad first; only then schedule the deferred work, immediately before the
  // response is returned.
  await padOpaqueResponse(startedAt);

  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true },
      });

      await equalizePasswordWork();
      if (!user) {
        await equalizeTokenWork();
        return;
      }

      const token = await issueAccountActionToken({
        userId: user.id,
        purpose: "PASSWORD_RESET",
      });
      if (!token) return;

      try {
        await sendPasswordResetEmail({ requestUrl, recipient: user, rawToken: token.rawToken });
      } catch (error) {
        logger.warn(
          {
            requestId,
            userId: user.id,
            reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown",
          },
          "Password-reset email delivery unavailable",
        );
      }
    } catch (error) {
      logger.warn(
        { requestId, errorName: error instanceof Error ? error.name : "unknown" },
        "Password-reset request work failed after the response",
      );
    }
  });

  return acceptedResponse();
}
