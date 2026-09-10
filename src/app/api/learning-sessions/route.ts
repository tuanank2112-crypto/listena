import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { createLearningSession } from "@/server/learning/service";
import { CreateLearningSessionSchema } from "@/server/validation/learning-session";
import {
  invalidRequest,
  learningSessionErrorResponse,
} from "@/app/api/learning-sessions/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateLearningSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return invalidRequest("Invalid learning session", parsed.error.flatten());
    }

    return NextResponse.json(
      await createLearningSession(session.user.id, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest("Invalid JSON body");
    return learningSessionErrorResponse(error);
  }
}
