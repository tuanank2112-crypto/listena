import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTTSCacheKey, resolveTTSCacheKeyInput } from "@/core/tts/cache-key";
import logger from "@/lib/logger";

// Engine version gắn với gói vieneu đang pin (vieneu==3.3.0).
const ENGINE_VERSION = "vieneu-3.3.0";
// Giới hạn độ dài văn bản để tránh lạm dụng sidecar.
const MAX_TEXT_LENGTH = 1000;

const DEFAULT_VOICE = process.env.VIENEU_DEFAULT_VOICE?.trim() || "";
const VIENEU_URL = process.env.VIENEU_URL ?? "http://localhost:8001";
const SHARED_SECRET = process.env.TTS_API_KEY ?? "";

interface VieNeuRequest {
  text: string;
  voice?: string;
  speed?: number;
}

/**
 * Route nội bộ /api/tts/vie — Next.js gọi sidecar VieNeu,
 * lưu cache trên đĩa, trả header immutable. Sidecar không public.
 */
export async function POST(request: NextRequest) {
  let body: VieNeuRequest;
  try {
    body = (await request.json()) as VieNeuRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text exceeds ${MAX_TEXT_LENGTH} chars` },
      { status: 400 }
    );
  }
  if (body.speed !== undefined && (typeof body.speed !== "number" || body.speed <= 0)) {
    return NextResponse.json({ error: "Speed must be a positive number" }, { status: 400 });
  }

  const voice = body.voice || DEFAULT_VOICE;
  const resolved = resolveTTSCacheKeyInput(
    { text, engineVersion: ENGINE_VERSION, speed: body.speed },
    voice
  );

  const key = await createTTSCacheKey(resolved);
  const cacheDir = path.resolve(process.env.TTS_CACHE_DIR ?? "public/tts", "vie");
  const cachePath = path.join(cacheDir, `${key}.wav`);

  try {
    // 1) Cache trên đĩa: trả ngay với header immutable
    const cached = await readFile(cachePath).catch(() => null);
    if (cached) {
      return new NextResponse(new Uint8Array(cached), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-TTS-Cache": "HIT",
          "X-TTS-Engine": ENGINE_VERSION,
          "X-TTS-Voice": resolved.voice,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 2) Chưa có cache → gọi sidecar
    if (!SHARED_SECRET) {
      logger.warn("TTS_API_KEY chưa được cấu hình; gọi sidecar VieNeu không có auth.");
    }
    const response = await fetch(`${VIENEU_URL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SHARED_SECRET ? { "X-TTS-Key": SHARED_SECRET } : {}),
      },
      body: JSON.stringify({
        text: resolved.text,
        voice: resolved.voice || undefined,
        speed: resolved.speed ?? 1,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.error({ status: response.status, detail }, "VieNeu sidecar failed");
      return NextResponse.json(
        { error: "VieNeu sidecar unavailable" },
        { status: 502 }
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath, audioBuffer).catch(() => undefined);

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "X-TTS-Cache": "MISS",
        "X-TTS-Engine": ENGINE_VERSION,
        "X-TTS-Voice": resolved.voice,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    logger.error({ error }, "VieNeu route failed");
    return NextResponse.json(
      { error: "VieNeu synthesis failed" },
      { status: 500 }
    );
  }
}

/** Danh sách giọng VieNeu từ sidecar (runtime, không hardcode). */
export async function GET() {
  try {
    const response = await fetch(`${VIENEU_URL}/voices`, {
      headers: SHARED_SECRET ? { "X-TTS-Key": SHARED_SECRET } : {},
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ voices: [] }, { status: 200 });
    const voices = await response.json();
    return NextResponse.json({ voices });
  } catch (error) {
    logger.error({ error }, "VieNeu voices fetch failed");
    return NextResponse.json({ voices: [] }, { status: 200 });
  }
}
