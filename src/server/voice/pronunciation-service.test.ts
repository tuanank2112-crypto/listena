import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOwned: vi.fn(),
  recordLearningEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/learning/repository", () => ({
  LearningSessionRepository: class {
    findOwned = mocks.findOwned;
  },
}));
vi.mock("@/server/learning/service", () => ({
  recordLearningEvent: mocks.recordLearningEvent,
}));

import { VoiceLineNotInSessionError, practicePronunciation } from "./pronunciation-service";
import { LearningSessionNotFoundError } from "@/server/learning/errors";

const SESSION_ID = "0b6f2b4e-6f13-4a4e-9a8e-4d0b1f1d5a11";
const ATTEMPT_ID = "3c0c2f6e-2a58-4d1b-9a55-8d3b8a9d1c22";

function record(npcReply = "What does your suitcase look like?") {
  const now = new Date("2026-09-18T00:00:00.000Z");
  return {
    id: SESSION_ID,
    lessonId: null,
    mode: "MISSION",
    status: "ACTIVE",
    goal: "Describe your bag",
    levelSnapshot: "A2",
    stateJson: JSON.stringify({
      phase: "ENCOUNTER", scenarioKey: "lost-luggage", scenarioTitle: "The Missing Suitcase", npcName: "Mia",
      npcRole: "Agent", learnerGoal: "Describe", targetVocabulary: [], targetGrammar: [], trust: 50, evidence: 0,
      turnCount: 1, successfulTurns: 0, recoveryCount: 0, maxTurns: 8,
    }),
    summary: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    lesson: null,
    turns: [
      {
        id: "turn-ai-1", sequence: 1, actor: "AI", turnType: "PROMPT", skillTags: "", createdAt: now,
        contentJson: JSON.stringify({
          npcReply,
          coachMessage: "Hãy tả màu và kích cỡ.",
          detectedError: { expected: "I lost my bag.", actual: "I lose my bag.", type: "grammar", explanationVi: "" },
        }),
      },
    ],
    evidence: [],
    interventions: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordLearningEvent.mockResolvedValue({ session: {} });
});

describe("practicePronunciation", () => {
  it("scores without touching the database when no session is given", async () => {
    const outcome = await practicePronunciation("learner-1", {
      clientAttemptId: ATTEMPT_ID,
      expected: "Good morning.",
      transcript: "good morning",
    });
    expect(outcome.recorded).toBe(false);
    expect(outcome.result.verdict).toBe("GOOD");
    expect(mocks.findOwned).not.toHaveBeenCalled();
    expect(mocks.recordLearningEvent).not.toHaveBeenCalled();
  });

  it("records a VOICE_PRACTICE event in percent when the line was modelled by the AI", async () => {
    mocks.findOwned.mockResolvedValue(record());
    const outcome = await practicePronunciation("learner-1", {
      clientAttemptId: ATTEMPT_ID,
      expected: "what does your suitcase look like",
      transcript: "what does your suitcase look like",
      sessionId: SESSION_ID,
    });
    expect(outcome.recorded).toBe(true);
    expect(mocks.findOwned).toHaveBeenCalledWith("learner-1", SESSION_ID);
    expect(mocks.recordLearningEvent).toHaveBeenCalledWith("learner-1", SESSION_ID, {
      type: "VOICE_PRACTICE",
      value: 100,
      clientEventId: `voice-${ATTEMPT_ID}`,
    });
  });

  it("accepts the corrected recast line but never the learner's erroneous one", async () => {
    mocks.findOwned.mockResolvedValue(record());
    await expect(practicePronunciation("learner-1", {
      clientAttemptId: ATTEMPT_ID, expected: "I lost my bag.", transcript: "I lost my bag", sessionId: SESSION_ID,
    })).resolves.toMatchObject({ recorded: true });
    await expect(practicePronunciation("learner-1", {
      clientAttemptId: ATTEMPT_ID, expected: "I lose my bag.", transcript: "I lose my bag", sessionId: SESSION_ID,
    })).rejects.toBeInstanceOf(VoiceLineNotInSessionError);
  });

  it("rejects lines that were never modelled in the session with a typed 400", async () => {
    mocks.findOwned.mockResolvedValue(record());
    const error = await practicePronunciation("learner-1", {
      clientAttemptId: ATTEMPT_ID, expected: "Give me your passport now.", transcript: "give me", sessionId: SESSION_ID,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VoiceLineNotInSessionError);
    expect((error as VoiceLineNotInSessionError).status).toBe(400);
    expect((error as VoiceLineNotInSessionError).code).toBe("EXPECTED_NOT_IN_SESSION");
    expect(mocks.recordLearningEvent).not.toHaveBeenCalled();
  });

  it("hides sessions the learner does not own", async () => {
    mocks.findOwned.mockResolvedValue(null);
    await expect(practicePronunciation("learner-2", {
      clientAttemptId: ATTEMPT_ID, expected: "Hello.", transcript: "hello", sessionId: SESSION_ID,
    })).rejects.toBeInstanceOf(LearningSessionNotFoundError);
  });
});
