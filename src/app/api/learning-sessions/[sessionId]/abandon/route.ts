import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { abandonLearningSession } from "@/server/learning/service";
import { withCompletedNextAction } from "@/app/api/learning-sessions/next-action";
import {
  invalidRequest,
  learningSessionErrorResponse,
} from "@/app/api/learning-sessions/http";

const SessionIdSchema = z.string().uuid();

/**
 * Plan13 SPEC-P131 §3 (finding S1): the learner's exit from a stuck session.
 * Owner-only and idempotent: ACTIVE -> ABANDONED (with a SYSTEM turn and
 * `completedAt`); a COMPLETED/ABANDONED session is returned unchanged with
 * 200. The body carries `code: "SESSION_ABANDONED"` and a next action so the
 * client can go straight to the dashboard recommendation.
 */
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

    const result = await withCompletedNextAction(
      authSession.user.id,
      await abandonLearningSession(authSession.user.id, parsedId.data),
    );
    return NextResponse.json({ ...result, code: "SESSION_ABANDONED" });
  } catch (error) {
    return learningSessionErrorResponse(error);
  }
}
