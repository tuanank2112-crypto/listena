import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { MAX_PRONUNCIATION_TEXT_CHARS } from "@/core/voice/pronunciation";
import { practicePronunciation } from "@/server/voice/pronunciation-service";
import {
  invalidRequest,
  learningSessionErrorResponse,
} from "@/app/api/learning-sessions/http";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export const PronunciationRequestSchema = z.object({
  clientAttemptId: z.string().uuid(),
  expected: z.string().trim().min(1).max(MAX_PRONUNCIATION_TEXT_CHARS),
  /** Empty is allowed: "nothing heard" is a valid, scorable outcome. */
  transcript: z.string().trim().max(MAX_PRONUNCIATION_TEXT_CHARS + 100).default(""),
  recognitionConfidence: z.number().min(0).max(1).optional(),
  sessionId: z.string().uuid().optional(),
});

/**
 * POST /api/voice/pronunciation — Plan14 SPEC-P141.
 *
 * Grades a browser speech-recognition transcript against the line the learner
 * was asked to repeat. Grading is deterministic and server-side; the audio
 * never leaves the browser. With `sessionId`, the line must be one the AI
 * modelled in that session and the score is recorded on the session ledger.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    if (session.user.role !== "LEARNER" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { code: "ROLE_FORBIDDEN", error: "Chỉ học viên mới luyện phát âm được." },
        { status: 403, headers: NO_STORE },
      );
    }

    const parsed = PronunciationRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return invalidRequest("Invalid pronunciation request", parsed.error.flatten());
    }

    const outcome = await practicePronunciation(session.user.id, parsed.data);
    return NextResponse.json(outcome, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest("Invalid JSON body");
    return learningSessionErrorResponse(error);
  }
}
