import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { issueAccountActionToken } from "@/server/account-actions";
import { sendVerificationEmail } from "@/server/account-email";
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
 * Reissues a verification link without revealing whether an email belongs to
 * an account (Plan13 A1): the response is fixed before any account read, the
 * elapsed time is padded to the same floor for every address, and only then
 * is the work scheduled with `after()` so nothing deferred overlaps the pad.
 * Both callback branches perform comparable database and bcrypt work. The
 * token service still enforces the durable per-account cooldown; a cooldown
 * hit is invisible to the caller.
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

  await padOpaqueResponse(startedAt);

  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      });

      await equalizePasswordWork();
      if (!user || user.emailVerifiedAt) {
        await equalizeTokenWork();
        return;
      }

      const token = await issueAccountActionToken({
        userId: user.id,
        purpose: "VERIFY_EMAIL",
      });
      if (!token) return;

      try {
        await sendVerificationEmail({ requestUrl, recipient: user, rawToken: token.rawToken });
      } catch (error) {
        logger.warn(
          {
            requestId,
            userId: user.id,
            reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown",
          },
          "Verification email delivery unavailable",
        );
      }
    } catch (error) {
      logger.warn(
        { requestId, errorName: error instanceof Error ? error.name : "unknown" },
        "Verification request work failed after the response",
      );
    }
  });

  return acceptedResponse();
}
