import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { completeLearningSession } from "@/server/learning/service";
import { withCompletedNextAction } from "@/app/api/learning-sessions/next-action";
import {
  invalidRequest,
  learningSessionErrorResponse,
} from "@/app/api/learning-sessions/http";

const SessionIdSchema = z.string().uuid();

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsedId = SessionIdSchema.safeParse((await params).sessionId);
    if (!parsedId.success) return invalidRequest("Invalid session id");

    return NextResponse.json(await withCompletedNextAction(
      authSession.user.id,
      await completeLearningSession(authSession.user.id, parsedId.data),
    ));
  } catch (error) {
    return learningSessionErrorResponse(error);
  }
}
