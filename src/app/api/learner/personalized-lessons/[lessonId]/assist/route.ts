import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import {
  PersonalizedLessonContentSchema,
  PersonalizedLessonValidatorSchema,
} from "@/server/personalized-learning/contracts";
import { buildAssistPayload, isAssistableAnswer } from "@/server/services/attempt-assist";
import { personalizedLearningErrorResponse } from "../../http";

const LessonIdSchema = z.string().uuid();

export const PersonalizedAssistRequestSchema = z.object({
  exerciseId: z.string().trim().regex(/^exercise-[1-6]$/),
  clientAttemptId: z.string().trim().min(8).max(120),
  mode: z.enum(["SKELETON", "TILES"]),
});

function privateNotFound() {
  return NextResponse.json(
    { error: "Không tìm thấy bài học riêng tư này.", code: "PRIVATE_NOT_FOUND" },
    { status: 404 },
  );
}

/**
 * POST /api/learner/personalized-lessons/{id}/assist — SPEC-P133.
 * Owner-only, READY lessons only, FILL/SPELL exercises only (CHOICE has its
 * own options and open answers do not exist for personalized lessons).
 * Determinism per `(clientAttemptId, mode)` replaces a stored assist limit.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (session.user.role !== "LEARNER" && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Chỉ học viên mới dùng được trợ giúp.", code: "ROLE_FORBIDDEN" },
      { status: 403 },
    );
  }
  const { lessonId } = await context.params;
  if (!LessonIdSchema.safeParse(lessonId).success) return privateNotFound();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const parsed = PersonalizedAssistRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Yêu cầu trợ giúp không hợp lệ", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const lesson = await prisma.personalizedLesson.findFirst({
      where: { id: lessonId, userId: session.user.id, status: "READY" },
      select: { contentJson: true, validatorJson: true },
    });
    if (!lesson) return privateNotFound();

    const content = PersonalizedLessonContentSchema.parse(JSON.parse(lesson.contentJson ?? ""));
    const validator = PersonalizedLessonValidatorSchema.parse(JSON.parse(lesson.validatorJson ?? ""));
    const exercise = content.exercises.find((item) => item.id === parsed.data.exerciseId);
    const answerKey = validator.exercises.find((item) => item.id === parsed.data.exerciseId);
    if (!exercise || !answerKey || exercise.type === "CHOICE") return privateNotFound();

    const answer = answerKey.acceptedAnswers[0] ?? "";
    if (!isAssistableAnswer(answer)) return privateNotFound();

    const payload = buildAssistPayload({
      mode: parsed.data.mode,
      answer,
      lessonWords: [content.transcript, ...content.vocabulary.map((item) => item.displayText)],
      clientAttemptId: parsed.data.clientAttemptId,
    });
    return NextResponse.json(payload, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return personalizedLearningErrorResponse(error);
  }
}
