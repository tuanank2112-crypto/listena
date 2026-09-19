import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { getLessonJourney, markLessonLearned } from "@/server/learning/lesson-journey";

/**
 * Plan22 SPEC-P223 — a lesson's journey for the learner looking at it.
 *
 * GET reports where they stand. POST records the one step nothing else can
 * prove: that they have read the lesson's words. Every other step is derived
 * from evidence already stored, so there is nothing else here to write.
 */

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function resolvePublishedLesson(lessonId: string) {
  return prisma.lesson.findFirst({
    where: { id: lessonId, status: "PUBLISHED" },
    select: { id: true },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ lessonId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();

    const { lessonId } = await context.params;
    if (!await resolvePublishedLesson(lessonId)) {
      return NextResponse.json({ error: "Không tìm thấy bài học" }, { status: 404 });
    }

    return NextResponse.json(await getLessonJourney(session.user.id, lessonId));
  } catch (error) {
    return failure(error, "Failed to read lesson journey");
  }
}

export async function POST(_request: Request, context: { params: Promise<{ lessonId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();

    const { lessonId } = await context.params;
    // A learner may only mark a lesson they can actually open; an unpublished
    // or missing lesson must not gain progress rows.
    if (!await resolvePublishedLesson(lessonId)) {
      return NextResponse.json({ error: "Không tìm thấy bài học" }, { status: 404 });
    }

    await markLessonLearned(session.user.id, lessonId);
    return NextResponse.json(await getLessonJourney(session.user.id, lessonId));
  } catch (error) {
    return failure(error, "Failed to record the learn step");
  }
}

function failure(error: unknown, message: string) {
  const databaseResponse = databaseErrorResponse(error);
  if (databaseResponse) return databaseResponse;

  logger.error({ error: error instanceof Error ? error.message : "unknown" }, message);
  return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
}
