import { after, NextResponse } from "next/server";
import type { Session } from "next-auth";
import logger from "@/lib/logger";
import { auth } from "@/server/auth/config";
import {
  PersonalizedLessonRequestSchema,
} from "@/server/personalized-learning/contracts";
import {
  claimPersonalizedLessonGeneration,
  listOwnedPersonalizedLessons,
  runPersonalizedLessonGeneration,
  type PersonalizedGenerationClaim,
} from "@/server/personalized-learning/service";
import { personalizedLearningErrorResponse } from "./http";

export const runtime = "nodejs";
// The provider call now runs in `after()`, which shares this route budget:
// it must still exceed the 180s provider timeout in vyce-chat-completions-provider.ts.
export const maxDuration = 200;

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

/**
 * Plan13 SPEC-P131 §4: asynchronous generation.
 *
 * - 200 `{ lesson, reused: true }` when a READY lesson already matches the
 *   learner snapshot.
 * - 202 `{ lesson: { id, status: "GENERATING" }, code: "GENERATION_IN_PROGRESS",
 *   retryAfterSeconds: 3 }` when a generation was claimed (or is already
 *   running). The provider call executes after this response is sent; the
 *   client polls `GET /api/learner/personalized-lessons/{id}` until READY or
 *   FAILED (at most 210s).
 * - 429/503 typed errors from the claim step (budget, provider not configured).
 */
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
    const claim = await claimPersonalizedLessonGeneration(userId, parsed.data.targetSkill);
    if (claim.kind === "ready") {
      return NextResponse.json({ lesson: claim.lesson, reused: true }, { status: 200 });
    }
    if (claim.kind === "claimed") scheduleGeneration(claim);
    return NextResponse.json(
      {
        lesson: { id: claim.lessonId, status: "GENERATING" as const },
        code: "GENERATION_IN_PROGRESS",
        retryAfterSeconds: claim.retryAfterSeconds,
      },
      {
        status: 202,
        headers: { "Retry-After": String(claim.retryAfterSeconds), "Cache-Control": "no-store" },
      },
    );
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

/**
 * `after()` (next/server, stable since 15.1) keeps the invocation alive until
 * the callback settles (Vercel `waitUntil`, or the Node server). If it is
 * unavailable in the current runtime the generation is still started as a
 * detached promise; `runPersonalizedLessonGeneration` never throws, so the
 * row always ends READY or FAILED.
 */
function scheduleGeneration(claim: Extract<PersonalizedGenerationClaim, { kind: "claimed" }>) {
  const task = () => runPersonalizedLessonGeneration(claim).catch((error: unknown) => {
    logger.error({ error, lessonId: claim.lessonId }, "Personalized lesson generation crashed");
  });
  try {
    after(task);
  } catch (error) {
    logger.warn({ error, lessonId: claim.lessonId }, "after() unavailable; running generation detached");
    void task();
  }
}
