import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import {
  consumeVerificationToken,
  isAccountActionTokenInvalidError,
} from "@/server/account-actions";
import { AccountActionTokenSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = AccountActionTokenSchema.safeParse(await request.json());
    if (!parsed.success) return invalidTokenResponse();

    await consumeVerificationToken(parsed.data.token);
    return NextResponse.json(
      { verified: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError || isAccountActionTokenInvalidError(error)) {
      return invalidTokenResponse();
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error("Email verification confirmation failed");
    return NextResponse.json(
      { error: "Không thể xác thực email lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function invalidTokenResponse() {
  return NextResponse.json(
    {
      error: "Liên kết xác thực không hợp lệ hoặc đã hết hạn.",
      code: "TOKEN_INVALID",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
