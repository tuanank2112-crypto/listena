import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import {
  consumePasswordResetToken,
  isAccountActionTokenInvalidError,
} from "@/server/account-actions";
import { PasswordResetConfirmSchema } from "@/server/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = PasswordResetConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const passwordHash = await hash(parsed.data.password, 12);
    await consumePasswordResetToken({
      rawToken: parsed.data.token,
      passwordHash,
    });

    return NextResponse.json(
      { passwordReset: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError || isAccountActionTokenInvalidError(error)) {
      return invalidTokenResponse();
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error("Password-reset confirmation failed");
    return NextResponse.json(
      { error: "Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function invalidTokenResponse() {
  return NextResponse.json(
    {
      error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      code: "TOKEN_INVALID",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
