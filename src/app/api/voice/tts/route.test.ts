import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveElevenLabsConfig: vi.fn(),
  getCuratedVoiceCatalogue: vi.fn(),
  synthesizeSpeech: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/voice/elevenlabs", async () => {
  class ElevenLabsError extends Error {
    constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds?: number) {
      super(`elevenlabs:${code}`);
    }
  }
  return {
    ELEVENLABS_MAX_TEXT_CHARS: 600,
    ElevenLabsError,
    resolveElevenLabsConfig: mocks.resolveElevenLabsConfig,
    getCuratedVoiceCatalogue: mocks.getCuratedVoiceCatalogue,
    synthesizeSpeech: mocks.synthesizeSpeech,
  };
});

import { GET, POST } from "./route";
import { ElevenLabsError } from "@/server/voice/elevenlabs";

const voice = { id: "TALIAxxxxxxxxxxxxxxx", name: "Talia", subtitle: "Mỹ · nữ · Warm soft guide", accent: "american", gender: "female", tier: "TOP", previewUrl: null, score: 120 };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
  mocks.resolveElevenLabsConfig.mockReturnValue({ apiKey: "k", modelEn: "eleven_multilingual_v2", modelVi: "eleven_flash_v2_5", voiceOverrides: {} });
  mocks.getCuratedVoiceCatalogue.mockResolvedValue({ "en-US": [voice], "en-GB": [], vi: [voice] });
  mocks.synthesizeSpeech.mockResolvedValue({ audio: new Uint8Array([1, 2]), contentType: "audio/mpeg", voiceId: voice.id, model: "eleven_multilingual_v2", cached: false });
});

describe("GET /api/voice/tts", () => {
  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("reports enabled=false without a key and never lists voices", async () => {
    mocks.resolveElevenLabsConfig.mockReturnValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, voices: { "en-US": [], "en-GB": [], vi: [] } });
    expect(mocks.getCuratedVoiceCatalogue).not.toHaveBeenCalled();
  });

  it("lists the curated catalogue without internal scores", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(payload.enabled).toBe(true);
    expect(payload.models).toEqual({ en: "eleven_multilingual_v2", vi: "eleven_flash_v2_5" });
    expect(payload.voices["en-US"][0]).toEqual({ id: voice.id, name: "Talia", subtitle: voice.subtitle, accent: "american", gender: "female", tier: "TOP", previewUrl: null });
    expect(payload.voices["en-US"][0].score).toBeUndefined();
  });
});

describe("POST /api/voice/tts", () => {
  it("rejects unauthenticated callers before synthesis", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request({ text: "Hi.", lang: "en" }))).status).toBe(401);
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("validates the body and returns 503 when not configured", async () => {
    expect((await POST(request({ text: "", lang: "en" }))).status).toBe(400);
    expect((await POST(request("{"))).status).toBe(400);
    mocks.resolveElevenLabsConfig.mockReturnValue(null);
    const response = await POST(request({ text: "Hi.", lang: "en" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "VOICE_NOT_CONFIGURED" });
  });

  it("returns private audio with voice headers", async () => {
    const response = await POST(request({ text: "Hello there.", lang: "en", accent: "en-GB", speed: 0.9 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Voice-Id")).toBe(voice.id);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(expect.anything(), { text: "Hello there.", lang: "en", accent: "en-GB", speed: 0.9 });
  });

  it("maps provider errors to typed responses with Retry-After", async () => {
    mocks.synthesizeSpeech.mockRejectedValue(new ElevenLabsError("rate_limited", 429, 7));
    const response = await POST(request({ text: "Hi.", lang: "en" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(await response.json()).toMatchObject({ code: "VOICE_RATE_LIMITED" });
    mocks.synthesizeSpeech.mockRejectedValue(new Error("boom"));
    expect((await POST(request({ text: "Hi.", lang: "en" }))).status).toBe(502);
  });
});
