import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  practicePronunciation: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/server/voice/pronunciation-service", async () => {
  const errors = await import("@/server/learning/errors");
  class VoiceLineNotInSessionError extends errors.LearningSessionError {
    constructor() {
      super("The repeated line does not belong to this learning session", "EXPECTED_NOT_IN_SESSION", 400);
    }
  }
  return { practicePronunciation: mocks.practicePronunciation, VoiceLineNotInSessionError };
});

import { POST } from "./route";
import { VoiceLineNotInSessionError } from "@/server/voice/pronunciation-service";

const ATTEMPT_ID = "3c0c2f6e-2a58-4d1b-9a55-8d3b8a9d1c22";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/voice/pronunciation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "learner-1", role: "LEARNER" } });
  mocks.practicePronunciation.mockResolvedValue({
    result: { score: 1, verdict: "GOOD", words: [], retryWords: [], feedbackVi: "Rất rõ!", recognitionConfidence: null },
    recorded: false,
  });
});

describe("POST /api/voice/pronunciation", () => {
  it("rejects unauthenticated callers before grading", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(request({ clientAttemptId: ATTEMPT_ID, expected: "Hi.", transcript: "hi" }));
    expect(response.status).toBe(401);
    expect(mocks.practicePronunciation).not.toHaveBeenCalled();
  });

  it("rejects teachers", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    const response = await POST(request({ clientAttemptId: ATTEMPT_ID, expected: "Hi.", transcript: "hi" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ROLE_FORBIDDEN" });
  });

  it("validates the body and malformed JSON", async () => {
    const invalid = await POST(request({ clientAttemptId: "nope", expected: "", transcript: "hi" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_INPUT" });
    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);
    expect(mocks.practicePronunciation).not.toHaveBeenCalled();
  });

  it("grades a transcript and returns a private, uncached result", async () => {
    const response = await POST(request({
      clientAttemptId: ATTEMPT_ID, expected: "Good morning.", transcript: "good morning", recognitionConfidence: 0.9,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ recorded: false, result: { verdict: "GOOD" } });
    expect(mocks.practicePronunciation).toHaveBeenCalledWith("learner-1", {
      clientAttemptId: ATTEMPT_ID, expected: "Good morning.", transcript: "good morning", recognitionConfidence: 0.9,
    });
  });

  it("allows an empty transcript so 'nothing heard' can be scored", async () => {
    const response = await POST(request({ clientAttemptId: ATTEMPT_ID, expected: "Good morning." }));
    expect(response.status).toBe(200);
    expect(mocks.practicePronunciation).toHaveBeenCalledWith("learner-1", expect.objectContaining({ transcript: "" }));
  });

  it("maps typed service errors to their status and code", async () => {
    mocks.practicePronunciation.mockRejectedValue(new VoiceLineNotInSessionError());
    const response = await POST(request({
      clientAttemptId: ATTEMPT_ID, expected: "Hi.", transcript: "hi", sessionId: "0b6f2b4e-6f13-4a4e-9a8e-4d0b1f1d5a11",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "EXPECTED_NOT_IN_SESSION" });
  });
});
