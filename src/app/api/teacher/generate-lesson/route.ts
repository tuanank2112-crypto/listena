import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { isAIProviderError } from "@/server/ai/errors";
import { GenerateLessonSchema } from "@/server/validation/schemas";
import { generateLessonFromRequest } from "@/server/services/lesson-authoring";
import { IdempotencyConflictError, OutcomePendingError } from "@/lib/idempotency";
import logger from "@/lib/logger";

export const runtime = "nodejs";
// Must exceed the 180s provider timeout in vyce-chat-completions-provider.ts.
export const maxDuration = 200;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json(
        { code: "FORBIDDEN", error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const body = await req.json();
    const parsed = GenerateLessonSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = await generateLessonFromRequest({
      userId: session.user.id,
      role: session.user.role,
      clientRequestId: parsed.data.clientRequestId,
      request: parsed.data,
    });

    return NextResponse.json(
      {
        replayed: result.replayed,
        lesson: { id: result.value.lessonId },
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      logger.warn({ code: error.code }, "Lesson generation idempotency conflict");
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (error instanceof OutcomePendingError) {
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

    if (isAIProviderError(error)) {
      logger.warn(
        { code: error.code, reason: error.details.reason, provider: error.details.provider },
        "AI lesson generation unavailable"
      );
      // Plan13 SPEC-P131 §2: typed codes keep their meaning.
      //  - AI_REQUEST_LIMIT (local budget): 429 + Retry-After.
      //  - AI_MISCONFIGURED: 503, no Retry-After, the error's own message
      //    ("báo quản trị") so the teacher stops retrying.
      //  - AI_RATE_LIMITED / AI_UNAVAILABLE: 503 + Retry-After when known.
      const retryAfterSeconds = error.code === "AI_MISCONFIGURED"
        ? undefined
        : error.details.retryAfterSeconds;
      return NextResponse.json(
        {
          code: error.code,
          error: error.code === "AI_MISCONFIGURED"
            ? error.message
            : "Dịch vụ AI hiện không khả dụng, vui lòng thử lại sau",
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        },
        {
          status: error.code === "AI_REQUEST_LIMIT" ? 429 : 503,
          headers: {
            "Cache-Control": "private, no-store",
            ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
          },
        }
      );
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Lesson generation failed"
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Tạo bài học thất bại" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
