import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import logger from "@/lib/logger";

const ENGINE_VERSION = "vieneu-3.3.0";
const RequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  voice: z.string().trim().min(1).max(100).optional(),
  speed: z.number().finite().min(0.5).max(2).default(1),
});

function sidecarConfig() {
  const key = process.env.TTS_API_KEY?.trim();
  return key ? { url: process.env.VIENEU_URL ?? "http://localhost:8001", key } : null;
}

async function fetchVoices(config: NonNullable<ReturnType<typeof sidecarConfig>>) {
  const response = await fetch(`${config.url}/voices`, {
    headers: { "X-TTS-Key": config.key }, cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Voice service unavailable");
  return z.array(z.object({ name: z.string().min(1), description: z.string().optional(), language: z.string().optional() })).parse(await response.json());
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid speech request" }, { status: 400 });
  const config = sidecarConfig();
  if (!config) return NextResponse.json({ error: "Speech service is not configured" }, { status: 503 });

  try {
    const voice = parsed.data.voice || process.env.VIENEU_DEFAULT_VOICE?.trim() || (await fetchVoices(config))[0]?.name;
    if (!voice) return NextResponse.json({ error: "No voice available" }, { status: 502 });
    const headers = {
      "Content-Type": "audio/wav",
      "X-TTS-Engine": ENGINE_VERSION,
      "X-TTS-Voice": encodeURIComponent(voice),
      "Cache-Control": "private, no-store",
    };
    const response = await fetch(`${config.url}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TTS-Key": config.key },
      body: JSON.stringify({ text: parsed.data.text, voice, speed: parsed.data.speed }),
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ error: "Speech service unavailable" }, { status: 502 });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (!audio.byteLength) return NextResponse.json({ error: "Empty speech response" }, { status: 502 });
    // Workers have no durable local filesystem. The authenticated upstream
    // response remains private and callers fall back to browser speech on error.
    return new NextResponse(audio, { headers: { ...headers, "X-TTS-Cache": "BYPASS" } });
  } catch {
    logger.warn("Speech service request failed");
    return NextResponse.json({ error: "Speech service unavailable" }, { status: 502 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = sidecarConfig();
  if (!config) return NextResponse.json({ voices: [], error: "Speech service is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ voices: await fetchVoices(config) });
  } catch {
    return NextResponse.json({ voices: [] }, { status: 502 });
  }
}
