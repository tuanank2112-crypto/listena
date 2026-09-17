import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import {
  ELEVENLABS_MAX_TEXT_CHARS,
  getCuratedVoiceCatalogue,
  resolveElevenLabsConfig,
  synthesizeSpeech,
} from "@/server/voice/elevenlabs";
import { audioResponse, VOICE_NO_STORE, voiceNotConfiguredResponse, voiceProviderErrorResponse } from "@/server/voice/http";
import { invalidRequest } from "@/app/api/learning-sessions/http";

export const runtime = "nodejs";

export const TtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(ELEVENLABS_MAX_TEXT_CHARS),
  lang: z.enum(["en", "vi"]),
  accent: z.enum(["en-US", "en-GB"]).optional(),
  voiceId: z.string().regex(/^[A-Za-z0-9]{8,64}$/).optional(),
  speed: z.number().min(0.5).max(1.5).optional(),
});

/**
 * GET /api/voice/tts — Plan15 SPEC-P150 §3. Tells the signed-in client whether
 * the AI voice is available and which curated voices it may pick. Never
 * exposes the key or the raw account list.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: VOICE_NO_STORE });
  }
  const config = resolveElevenLabsConfig();
  if (!config) {
    return NextResponse.json({ enabled: false, voices: { "en-US": [], "en-GB": [], vi: [] } }, { headers: VOICE_NO_STORE });
  }
  try {
    const catalogue = await getCuratedVoiceCatalogue(config);
    const publicVoice = ({ id, name, subtitle, accent, gender, tier, previewUrl }: (typeof catalogue)["en-US"][number]) =>
      ({ id, name, subtitle, accent, gender, tier, previewUrl });
    return NextResponse.json(
      {
        enabled: true,
        models: { en: config.modelEn, vi: config.modelVi },
        voices: {
          "en-US": catalogue["en-US"].map(publicVoice),
          "en-GB": catalogue["en-GB"].map(publicVoice),
          vi: catalogue.vi.map(publicVoice),
        },
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return voiceProviderErrorResponse(error) ?? NextResponse.json({ enabled: false, voices: { "en-US": [], "en-GB": [], vi: [] } }, { status: 502, headers: VOICE_NO_STORE });
  }
}

/**
 * POST /api/voice/tts — synthesise one curated line. The client sends text it
 * is allowed to see (already on screen); hidden answers use the dedicated
 * game/personalized audio routes that read the text server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: VOICE_NO_STORE });
    }
    const parsed = TtsRequestSchema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest("Invalid speech request", parsed.error.flatten());
    const config = resolveElevenLabsConfig();
    if (!config) return voiceNotConfiguredResponse();

    const output = await synthesizeSpeech(config, parsed.data);
    return audioResponse(output.audio, output.contentType, {
      "X-Voice-Id": output.voiceId,
      "X-Voice-Model": output.model,
      "X-Voice-Cache": output.cached ? "HIT" : "MISS",
    });
  } catch (error) {
    if (error instanceof SyntaxError) return invalidRequest("Invalid JSON body");
    const mapped = voiceProviderErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json({ code: "VOICE_UPSTREAM", error: "Giọng AI hiện chưa sẵn sàng." }, { status: 502, headers: VOICE_NO_STORE });
  }
}
