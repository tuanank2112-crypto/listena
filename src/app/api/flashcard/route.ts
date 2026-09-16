import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { reviewFlashcard } from "@/server/services/learning";
import { ReviewFlashcardSchema } from "@/server/validation/schemas";
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
    const parsed = ReviewFlashcardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = await reviewFlashcard({
      userId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json(
      {
        replayed: result.replayed,
        ...result.value,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      logger.warn({ code: error.code }, "Flashcard review idempotency conflict");
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (error instanceof OutcomePendingError) {
      logger.warn({ code: error.code, retryAfter: error.retryAfterSeconds }, "Flashcard review schedule collision");
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
    if (message === "Flashcard not found") {
      return NextResponse.json(
        { code: "NOT_FOUND", error: "Không tìm thấy thẻ từ vựng" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Flashcard review failed"
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Có lỗi xảy ra khi ôn tập thẻ" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
