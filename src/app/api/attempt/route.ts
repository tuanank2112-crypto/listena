import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { submitAttempt } from "@/server/services/learning";
import { SubmitAttemptSchema } from "@/server/validation/schemas";
import { IdempotencyConflictError, OutcomePendingError } from "@/lib/idempotency";
import logger from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { code: "UNAUTHENTICATED", error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const body = await req.json();
    const parsed = SubmitAttemptSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { userId: session.user.id, code: "VALIDATION_ERROR" },
        "Attempt validation failed"
      );
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = await submitAttempt({
      userId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json(
      {
        replayed: result.replayed,
        ...result.value,
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      logger.warn({ code: error.code }, "Attempt idempotency conflict");
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (error instanceof OutcomePendingError) {
      logger.warn({ code: error.code, retryAfter: error.retryAfterSeconds }, "Attempt outcome pending");
      return NextResponse.json(
        { code: error.code, error: error.message, retryAfterSeconds: error.retryAfterSeconds },
        {
          status: 409,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(error.retryAfterSeconds),
          },
        }
      );
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    if (message === "Exercise not found" || message === "Exercise does not belong to the lesson") {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Attempt submission failed"
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Có lỗi xảy ra khi chấm bài" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
