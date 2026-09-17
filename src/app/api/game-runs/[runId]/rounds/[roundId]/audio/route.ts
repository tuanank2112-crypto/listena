import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { getAdaptiveGameRoundSpeechText } from "@/server/adaptive-games/service";
import { adaptiveGameErrorResponse } from "@/server/adaptive-games/route-response";
import { resolveElevenLabsConfig, synthesizeSpeech } from "@/server/voice/elevenlabs";
import { audioResponse, voiceNotConfiguredResponse, voiceProviderErrorResponse } from "@/server/voice/http";

export const runtime = "nodejs";

const ParamsSchema = z.object({ runId: z.string().uuid(), roundId: z.string().uuid() });

/**
 * GET /api/game-runs/{runId}/rounds/{roundId}/audio — Plan15 SPEC-P151 §2.
 *
 * The "Nghe & viết" round hides its answer, so the browser cannot synthesise
 * it. This route reads the word server-side and returns audio only; the text
 * never appears in the response. Owner-only, SPELL rounds only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; roundId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Lượt game không hợp lệ" }, { status: 400 });
  }
  const config = resolveElevenLabsConfig();
  if (!config) return voiceNotConfiguredResponse();

  try {
    const text = await getAdaptiveGameRoundSpeechText(session.user.id, parsed.data.runId, parsed.data.roundId);
    const accent = request.nextUrl.searchParams.get("accent") === "en-GB" ? "en-GB" : "en-US";
    const output = await synthesizeSpeech(config, { text, lang: "en", accent, speed: 0.9 });
    return audioResponse(output.audio, output.contentType, { "X-Voice-Cache": output.cached ? "HIT" : "MISS" });
  } catch (error) {
    return voiceProviderErrorResponse(error) ?? adaptiveGameErrorResponse(error);
  }
}
