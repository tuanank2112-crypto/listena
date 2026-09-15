import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { issueAccountActionToken } from "@/server/account-actions";
import { sendPasswordResetEmail } from "@/server/account-email";
import { isEmailDeliveryUnavailableError } from "@/server/email";
import { AccountActionRequestSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

const acceptedResponse = () => NextResponse.json(
  { accepted: true },
  { status: 202, headers: { "Cache-Control": "no-store" } },
);

/**
 * Always returns the same accepted response for a valid email-shaped input to
 * prevent account enumeration. Email delivery errors follow the same rule.
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
      select: { id: true, name: true, email: true },
    });
    if (!user) return acceptedResponse();

    const token = await issueAccountActionToken({
      userId: user.id,
      purpose: "PASSWORD_RESET",
    });
    if (!token) return acceptedResponse();

    try {
      await sendPasswordResetEmail({
        requestUrl: request.url,
        recipient: user,
        rawToken: token.rawToken,
      });
    } catch (error) {
      logger.warn(
        { userId: user.id, reason: isEmailDeliveryUnavailableError(error) ? error.details.reason : "unknown" },
        "Password-reset email delivery unavailable",
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

    logger.error("Password-reset request failed");
    return NextResponse.json(
      { error: "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
