import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/server/auth/config";
import {
  PersonalizedLessonRequestSchema,
} from "@/server/personalized-learning/contracts";
import {
  listOwnedPersonalizedLessons,
  provisionPersonalizedLesson,
} from "@/server/personalized-learning/service";
import { personalizedLearningErrorResponse } from "./http";

export const runtime = "nodejs";
export const maxDuration = 60;

function learnerId(session: Session | null) {
  if (!session?.user?.id) return null;
  if (session.user.role !== "LEARNER" && session.user.role !== "ADMIN") return null;
  return session.user.id;
}

export async function GET() {
  const userId = learnerId(await auth());
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ lessons: await listOwnedPersonalizedLessons(userId) });
  } catch (error) {
    return personalizedLearningErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = learnerId(await auth());
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = PersonalizedLessonRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Yêu cầu tạo bài học không hợp lệ", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await provisionPersonalizedLesson(userId, parsed.data.targetSkill);
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
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
