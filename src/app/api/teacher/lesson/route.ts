import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import { CreateLessonSchema } from "@/server/validation/schemas";
import {
  createLessonFromRequest,
  publishLesson,
  LessonGraphIncompleteError,
} from "@/server/services/lesson-authoring";
import { IdempotencyConflictError, OutcomePendingError } from "@/lib/idempotency";
import logger from "@/lib/logger";

/** PUT body contract (Plan13 P130 §6). Anything else is a 400, never a guess. */
const LessonActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["review", "publish"]),
});

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
    const parsed = CreateLessonSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = await createLessonFromRequest({
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
      logger.warn({ code: error.code }, "Lesson creation idempotency conflict");
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

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Course not found") {
      return NextResponse.json(
        { code: "NOT_FOUND", error: "Course not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    if (message === "Forbidden") {
      return NextResponse.json(
        { code: "FORBIDDEN", error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Lesson creation failed"
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Tạo bài học thất bại" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json(
        { code: "FORBIDDEN", error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
    const parsed = LessonActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const { id, action } = parsed.data;

    if (action === "publish") {
      const result = await publishLesson({
        lessonId: id,
        userId: session.user.id,
        role: session.user.role,
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (action === "review") {
      const lesson = await prisma.lesson.findUnique({
        where: { id },
        select: { createdById: true },
      });
      if (!lesson) {
        return NextResponse.json(
          { code: "NOT_FOUND", error: "Lesson not found" },
          { status: 404, headers: { "Cache-Control": "private, no-store" } }
        );
      }
      if (lesson.createdById !== session.user.id && session.user.role !== "ADMIN") {
        return NextResponse.json(
          { code: "FORBIDDEN", error: "Forbidden" },
          { status: 403, headers: { "Cache-Control": "private, no-store" } }
        );
      }
      await prisma.lesson.update({
        where: { id },
        data: { status: "REVIEWED" },
      });
      return NextResponse.json(
        { status: "REVIEWED" },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    // `action` is an exhaustive enum; the schema already rejected anything else.
    return NextResponse.json(
      { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof LessonGraphIncompleteError) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Lesson not found") {
      return NextResponse.json(
        { code: "NOT_FOUND", error: "Lesson not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    if (message === "Forbidden") {
      return NextResponse.json(
        { code: "FORBIDDEN", error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Lesson update failed"
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Cập nhật thất bại" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
