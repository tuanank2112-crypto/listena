import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  resolveElevenLabsConfig: vi.fn(),
  synthesizeSpeech: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { personalizedLesson: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/voice/elevenlabs", () => {
  class ElevenLabsError extends Error {
    constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds?: number) {
      super(`elevenlabs:${code}`);
    }
  }
  return { ElevenLabsError, resolveElevenLabsConfig: mocks.resolveElevenLabsConfig, synthesizeSpeech: mocks.synthesizeSpeech };
});

import { GET } from "./route";

const LESSON = "0b6f2b4e-6f13-4a4e-9a8e-4d0b1f1d5a11";

const content = {
  introVi: "Giới thiệu",
  transcript: "We booked a room at the Sunrise Hotel and asked for a late checkout.",
  vocabulary: [
    { id: "00000000-0000-4000-8000-000000000101", lemma: "checkout", displayText: "checkout", meaningVi: "trả phòng", cefrLevel: "A2", isTarget: true, importance: 1 },
    { id: "00000000-0000-4000-8000-000000000102", lemma: "booked", displayText: "booked", meaningVi: "đã đặt", cefrLevel: "A2", isTarget: true, importance: 1 },
  ],
  exercises: [
    { id: "exercise-1", type: "SPELL", prompt: "Nghe và viết từ." },
    { id: "exercise-2", type: "FILL", prompt: "We ___ a room." },
  ],
};
const validator = {
  exercises: [
    { id: "exercise-1", acceptedAnswers: ["suitcase"], feedbackVi: "Đúng rồi" },
    { id: "exercise-2", acceptedAnswers: ["booked"], feedbackVi: "Đúng rồi" },
  ],
};

function call(exerciseId: string) {
  const request = new NextRequest(`http://localhost/api/learner/personalized-lessons/${LESSON}/exercises/${exerciseId}/audio`);
  return GET(request, { params: Promise.resolve({ lessonId: LESSON, exerciseId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
  mocks.resolveElevenLabsConfig.mockReturnValue({ apiKey: "k" });
  mocks.findFirst.mockResolvedValue({ contentJson: JSON.stringify(content), validatorJson: JSON.stringify(validator) });
  mocks.synthesizeSpeech.mockResolvedValue({ audio: new Uint8Array([3]), contentType: "audio/mpeg", voiceId: "v", model: "m", cached: false });
});

describe("GET personalized exercise audio", () => {
  it("requires a learner session and a configured voice", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "t", role: "TEACHER" } });
    expect((await call("exercise-1")).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
    mocks.resolveElevenLabsConfig.mockReturnValue(null);
    expect((await call("exercise-1")).status).toBe(503);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("speaks only the hidden SPELL answer of an owned READY lesson", async () => {
    const response = await call("exercise-1");
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: LESSON, userId: "learner-1", status: "READY" } }));
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(expect.anything(), { text: "suitcase", lang: "en", accent: "en-US", speed: 0.9 });
  });

  it("refuses FILL exercises (the answer would reveal the blank) and unknown lessons", async () => {
    expect((await call("exercise-2")).status).toBe(404);
    expect((await call("exercise-9")).status).toBe(404);
    mocks.findFirst.mockResolvedValue(null);
    expect((await call("exercise-1")).status).toBe(404);
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });
});
