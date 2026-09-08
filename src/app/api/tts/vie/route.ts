import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { createTTSCacheKey, resolveTTSCacheKeyInput } from "@/core/tts/cache-key";
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
    const resolved = resolveTTSCacheKeyInput({ text: parsed.data.text, speed: parsed.data.speed, engineVersion: ENGINE_VERSION }, voice);
    const key = await createTTSCacheKey(resolved);
    // Runtime-created cache path: do not ask Turbopack to trace learner audio directories.
    // Learner text audio is accessed through this authenticated route, not public/.
    const cacheDir = path.resolve(/* turbopackIgnore: true */ process.env.TTS_PROXY_CACHE_DIR ?? "tts-service/cache/proxy");
    const cachePath = path.join(cacheDir, `${key}.wav`);
    const headers = {
      "Content-Type": "audio/wav",
      "X-TTS-Engine": ENGINE_VERSION,
      "X-TTS-Voice": encodeURIComponent(voice),
      "Cache-Control": "private, no-store",
    };
    const cached = await readFile(cachePath).catch(() => null);
    if (cached) return new NextResponse(new Uint8Array(cached), { headers: { ...headers, "X-TTS-Cache": "HIT" } });

    const response = await fetch(`${config.url}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TTS-Key": config.key },
      body: JSON.stringify({ text: resolved.text, voice, speed: resolved.speed }),
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ error: "Speech service unavailable" }, { status: 502 });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (!audio.byteLength) return NextResponse.json({ error: "Empty speech response" }, { status: 502 });
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cachePath, audio);
    } catch {
      logger.warn("Speech cache unavailable; returning generated audio");
    }
    return new NextResponse(audio, { headers: { ...headers, "X-TTS-Cache": "MISS" } });
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
