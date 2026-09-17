import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { recordLearningEvent } from "@/server/learning/service";
import { LearningEventSchema } from "@/server/validation/learning-session";
import {
  invalidRequest,
  learningSessionErrorResponse,
} from "@/app/api/learning-sessions/http";

const SessionIdSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsedId = SessionIdSchema.safeParse((await params).sessionId);
    if (!parsedId.success) return invalidRequest("Invalid session id");

    const parsed = LearningEventSchema.safeParse(await request.json());
    if (!parsed.success) {
      return invalidRequest("Invalid learning event", parsed.error.flatten());
    }
    // A voice practice score is server-graded evidence; it may only be recorded
    // by the pronunciation route after the repeated line is verified (Plan14).
    if (parsed.data.type === "VOICE_PRACTICE") {
      return invalidRequest("Voice practice is recorded through /api/voice/pronunciation");
    }

    return NextResponse.json(
      await recordLearningEvent(authSession.user.id, parsedId.data, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest("Invalid JSON body");
    return learningSessionErrorResponse(error);
  }
}
