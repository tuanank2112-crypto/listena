import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { getOwnedPersonalizedLessonStatus } from "@/server/personalized-learning/service";
import { personalizedLearningErrorResponse } from "../http";

const LessonIdSchema = z.string().uuid();

/**
 * Plan13 SPEC-P131 §4: the poll target of the async generation flow.
 * READY -> `{ lesson: <public lesson with status "READY"> }` (content, no answers).
 * GENERATING/FAILED -> `{ lesson: { id, status, failureCode?, targetSkill,
 * generationAttempt, generationStartedAt, retryAfterSeconds } }` with 200, never 404.
 * Unknown/foreign/archived id -> 404 PRIVATE_NOT_FOUND.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || (session.user.role !== "LEARNER" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { lessonId } = await context.params;
  if (!LessonIdSchema.safeParse(lessonId).success) {
    return NextResponse.json({ error: "Không tìm thấy bài học", code: "PRIVATE_NOT_FOUND" }, { status: 404 });
  }
  try {
    const lesson = await getOwnedPersonalizedLessonStatus(session.user.id, lessonId);
    return NextResponse.json(
      { lesson },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(lesson.status === "GENERATING" ? { "Retry-After": String(lesson.retryAfterSeconds) } : {}),
        },
      },
    );
  } catch (error) {
    return personalizedLearningErrorResponse(error);
  }
}
