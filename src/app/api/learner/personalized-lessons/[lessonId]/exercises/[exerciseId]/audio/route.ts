import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import {
  PersonalizedLessonContentSchema,
  PersonalizedLessonValidatorSchema,
} from "@/server/personalized-learning/contracts";
import { resolveElevenLabsConfig, synthesizeSpeech } from "@/server/voice/elevenlabs";
import { audioResponse, voiceNotConfiguredResponse, voiceProviderErrorResponse } from "@/server/voice/http";
import { personalizedLearningErrorResponse } from "../../../../http";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  lessonId: z.string().uuid(),
  exerciseId: z.string().trim().regex(/^exercise-[1-6]$/),
});

function privateNotFound() {
  return NextResponse.json(
    { error: "Không tìm thấy bài học riêng tư này.", code: "PRIVATE_NOT_FOUND" },
    { status: 404 },
  );
}

/**
 * GET /api/learner/personalized-lessons/{id}/exercises/{exerciseId}/audio —
 * Plan15 SPEC-P151 §3. Speaks the hidden answer of a SPELL ("Viết chính tả")
 * exercise for its owner. FILL and CHOICE are never voiced here because their
 * answer would reveal the exercise; their visible prompt is spoken client-side.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lessonId: string; exerciseId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || (session.user.role !== "LEARNER" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) return privateNotFound();
  const config = resolveElevenLabsConfig();
  if (!config) return voiceNotConfiguredResponse();

  try {
    const lesson = await prisma.personalizedLesson.findFirst({
      where: { id: parsed.data.lessonId, userId: session.user.id, status: "READY" },
      select: { contentJson: true, validatorJson: true },
    });
    if (!lesson) return privateNotFound();
    const content = PersonalizedLessonContentSchema.parse(JSON.parse(lesson.contentJson ?? ""));
    const validator = PersonalizedLessonValidatorSchema.parse(JSON.parse(lesson.validatorJson ?? ""));
    const exercise = content.exercises.find((item) => item.id === parsed.data.exerciseId);
    const answerKey = validator.exercises.find((item) => item.id === parsed.data.exerciseId);
    const text = answerKey?.acceptedAnswers[0] ?? "";
    if (!exercise || exercise.type !== "SPELL" || !text) return privateNotFound();

    const accent = request.nextUrl.searchParams.get("accent") === "en-GB" ? "en-GB" : "en-US";
    const output = await synthesizeSpeech(config, { text, lang: "en", accent, speed: 0.9 });
    return audioResponse(output.audio, output.contentType, { "X-Voice-Cache": output.cached ? "HIT" : "MISS" });
  } catch (error) {
    return voiceProviderErrorResponse(error) ?? personalizedLearningErrorResponse(error);
  }
}
