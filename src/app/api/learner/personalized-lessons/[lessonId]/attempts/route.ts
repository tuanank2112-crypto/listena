import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { PersonalizedLessonAttemptInputSchema } from "@/server/personalized-learning/contracts";
import { submitPersonalizedLessonAttempt } from "@/server/personalized-learning/service";
import { personalizedLearningErrorResponse } from "../../http";

const LessonIdSchema = z.string().uuid();

export async function POST(
  request: Request,
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
    const parsed = PersonalizedLessonAttemptInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Câu trả lời không hợp lệ", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await submitPersonalizedLessonAttempt({
      userId: session.user.id,
      lessonId,
      ...parsed.data,
    });
    return NextResponse.json(result, { status: result.attempt.idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Dữ liệu gửi lên không hợp lệ", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    return personalizedLearningErrorResponse(error);
  }
}
