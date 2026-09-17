import { NextResponse } from "next/server";
import { ElevenLabsError } from "@/server/voice/elevenlabs";

export const VOICE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * Maps a typed ElevenLabs failure to a response the client can act on:
 * 503 (not configured / unauthorized / quota) and 502/504 mean "fall back to
 * the browser voice"; 429 carries Retry-After; 400 is a caller bug.
 */
export function voiceProviderErrorResponse(error: unknown) {
  if (error instanceof ElevenLabsError) {
    return NextResponse.json(
      {
        code: `VOICE_${error.code.toUpperCase()}`,
        error: "Giọng AI hiện chưa sẵn sàng; dùng giọng trình duyệt.",
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      },
      {
        status: error.status,
        headers: {
          ...VOICE_NO_STORE,
          ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {}),
        },
      },
    );
  }
  return null;
}

export function voiceNotConfiguredResponse() {
  return NextResponse.json(
    { code: "VOICE_NOT_CONFIGURED", error: "Giọng AI chưa được cấu hình." },
    { status: 503, headers: VOICE_NO_STORE },
  );
}

export function audioResponse(audio: Uint8Array, contentType: string, extra: Record<string, string> = {}) {
  // The route returns bytes; Uint8Array<ArrayBufferLike> is not in Next's BodyInit typing.
  return new NextResponse(audio as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": contentType, ...VOICE_NO_STORE, ...extra },
  });
}
