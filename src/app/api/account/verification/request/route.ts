import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { issueAccountActionToken } from "@/server/account-actions";
import {
  isEmailDeliveryUnavailableError,
} from "@/server/email";
import { sendVerificationEmail } from "@/server/account-email";
import { AccountActionRequestSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

const acceptedResponse = () => NextResponse.json(
  { accepted: true },
  { status: 202, headers: { "Cache-Control": "no-store" } },
);

/**
 * Reissues a verification link without revealing whether an email belongs to
 * an account. The token service enforces the durable per-account cooldown.
 */
export async function POST(request: Request) {
  try {
    const parsed = AccountActionRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt) return acceptedResponse();

    const token = await issueAccountActionToken({
      userId: user.id,
      purpose: "VERIFY_EMAIL",
    });
    if (!token) return acceptedResponse();

    try {
      await sendVerificationEmail({
        requestUrl: request.url,
        recipient: user,
        rawToken: token.rawToken,
      });
    } catch (error) {
      // The response intentionally stays generic so this endpoint cannot be
      // used to discover which email addresses are registered.
      logger.warn(
        { userId: user.id, reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown" },
        "Verification email delivery unavailable",
      );
    }

    return acceptedResponse();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error("Verification request failed");
    return NextResponse.json(
      { error: "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
