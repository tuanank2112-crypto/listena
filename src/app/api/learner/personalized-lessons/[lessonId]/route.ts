import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { getOwnedPersonalizedLesson } from "@/server/personalized-learning/service";
import { personalizedLearningErrorResponse } from "../http";

const LessonIdSchema = z.string().uuid();

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
    return NextResponse.json({ lesson: await getOwnedPersonalizedLesson(session.user.id, lessonId) });
  } catch (error) {
    return personalizedLearningErrorResponse(error);
  }
}
