import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAdaptiveGameRoundSpeechText: vi.fn(),
  resolveElevenLabsConfig: vi.fn(),
  synthesizeSpeech: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/adaptive-games/service", () => ({ getAdaptiveGameRoundSpeechText: mocks.getAdaptiveGameRoundSpeechText }));
vi.mock("@/server/voice/elevenlabs", () => {
  class ElevenLabsError extends Error {
    constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds?: number) {
      super(`elevenlabs:${code}`);
    }
  }
  return { ElevenLabsError, resolveElevenLabsConfig: mocks.resolveElevenLabsConfig, synthesizeSpeech: mocks.synthesizeSpeech };
});

import { GET } from "./route";
import { AdaptiveGamePrivateNotFoundError } from "@/server/adaptive-games/errors";

const RUN = "0b6f2b4e-6f13-4a4e-9a8e-4d0b1f1d5a11";
const ROUND = "3c0c2f6e-2a58-4d1b-9a55-8d3b8a9d1c22";

function call(accent?: string) {
  const request = new NextRequest(`http://localhost/api/game-runs/${RUN}/rounds/${ROUND}/audio${accent ? `?accent=${accent}` : ""}`);
  return GET(request, { params: Promise.resolve({ runId: RUN, roundId: ROUND }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
  mocks.resolveElevenLabsConfig.mockReturnValue({ apiKey: "k" });
  mocks.getAdaptiveGameRoundSpeechText.mockResolvedValue("suitcase");
  mocks.synthesizeSpeech.mockResolvedValue({ audio: new Uint8Array([7]), contentType: "audio/mpeg", voiceId: "v", model: "m", cached: true });
});

describe("GET game round audio", () => {
  it("requires a session and a configured voice", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
    mocks.resolveElevenLabsConfig.mockReturnValue(null);
    expect((await call()).status).toBe(503);
    expect(mocks.getAdaptiveGameRoundSpeechText).not.toHaveBeenCalled();
  });

  it("speaks the hidden word for the owner with the requested accent and never echoes the text", async () => {
    const response = await call("en-GB");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("X-Voice-Cache")).toBe("HIT");
    expect(mocks.getAdaptiveGameRoundSpeechText).toHaveBeenCalledWith("learner-1", RUN, ROUND);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(expect.anything(), { text: "suitcase", lang: "en", accent: "en-GB", speed: 0.9 });
    expect([...response.headers.keys()].some((key) => key.toLowerCase().includes("text"))).toBe(false);
  });

  it("hides foreign or non-spell rounds behind 404", async () => {
    mocks.getAdaptiveGameRoundSpeechText.mockRejectedValue(new AdaptiveGamePrivateNotFoundError());
    const response = await call();
    expect(response.status).toBe(404);
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });
});
