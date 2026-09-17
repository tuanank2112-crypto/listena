import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { buildAssistPayload, isAssistableAnswer } from "@/server/services/attempt-assist";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export const AssistRequestSchema = z.object({
  exerciseId: z.string().uuid(),
  lessonId: z.string().uuid(),
  clientAttemptId: z.string().uuid(),
  mode: z.enum(["SKELETON", "TILES"]),
});

function notFound() {
  return NextResponse.json(
    { code: "NOT_FOUND", error: "Bài tập này không hỗ trợ trợ giúp." },
    { status: 404, headers: NO_STORE },
  );
}

/**
 * POST /api/attempt/assist — SPEC-P133.
 *
 * Returns a paid, partial view of the answer (word skeleton or shuffled tiles).
 * The full answer never leaves the server in order. Rate limiting is by
 * determinism: the same `(clientAttemptId, mode)` always produces the same
 * payload, so repeating the call buys nothing (see attempt-assist.ts).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ code: "UNAUTHENTICATED", error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    if (session.user.role !== "LEARNER" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { code: "ROLE_FORBIDDEN", error: "Chỉ học viên mới dùng được trợ giúp." },
        { status: 403, headers: NO_STORE },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const parsed = AssistRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE },
      );
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: parsed.data.exerciseId },
      select: {
        id: true,
        lessonId: true,
        correctAnswer: true,
        metadata: true,
        lesson: {
          select: {
            status: true,
            transcript: true,
            vocabulary: { select: { vocabularyItem: { select: { displayText: true } } } },
          },
        },
      },
    });

    if (!exercise || exercise.lessonId !== parsed.data.lessonId || exercise.lesson.status !== "PUBLISHED") {
      return notFound();
    }

    let metadata: { answerMode?: string } = {};
    try {
      metadata = JSON.parse(exercise.metadata || "{}") as { answerMode?: string };
    } catch {
      metadata = {};
    }
    if (metadata.answerMode === "open" || !isAssistableAnswer(exercise.correctAnswer)) {
      return notFound();
    }

    const payload = buildAssistPayload({
      mode: parsed.data.mode,
      answer: exercise.correctAnswer,
      lessonWords: [
        exercise.lesson.transcript,
        ...exercise.lesson.vocabulary.map((item) => item.vocabularyItem.displayText),
      ],
      clientAttemptId: parsed.data.clientAttemptId,
    });

    return NextResponse.json(payload, { status: 200, headers: NO_STORE });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown", code: "INTERNAL_ERROR" },
      "Attempt assist failed",
    );
    return NextResponse.json(
      { code: "INTERNAL_ERROR", error: "Có lỗi xảy ra khi lấy trợ giúp" },
      { status: 500, headers: NO_STORE },
    );
  }
}
