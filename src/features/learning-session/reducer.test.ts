import { describe, expect, it } from "vitest";
import { createInitialPlayerState, learningSessionPlayerReducer } from "./reducer";
import type { PublicLearningSession, TurnSubmission } from "./types";

function session(status: PublicLearningSession["status"] = "ACTIVE"): PublicLearningSession {
  return {
    id: "session-1",
    lessonId: null,
    mode: "MISSION",
    status,
    goal: "Ask for help",
    levelSnapshot: "A2",
    state: {
      phase: "ENCOUNTER",
      scenarioKey: "lost-bag",
      scenarioTitle: "Lost luggage",
      npcName: "Mia",
      npcRole: "Airport agent",
      learnerGoal: "Describe your bag",
      targetVocabulary: ["suitcase"],
      targetGrammar: ["past simple"],
      trust: 40,
      evidence: 20,
      turnCount: 1,
      successfulTurns: 0,
      recoveryCount: 0,
      maxTurns: 8,
    },
    lesson: null,
    turns: [],
    evidence: [],
    interventions: [],
    summary: null,
    startedAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    completedAt: null,
  };
}

describe("learningSessionPlayerReducer", () => {
  it("loads an active session into the ready state", () => {
    const result = learningSessionPlayerReducer(createInitialPlayerState(10), {
      type: "LOAD_SUCCESS",
      session: session(),
      now: 20,
    });

    expect(result.phase).toBe("ready");
    expect(result.turnStartedAt).toBe(20);
  });

  it("keeps the same submission after a network failure so retry stays idempotent", () => {
    const submission: TurnSubmission = {
      clientTurnId: "client-turn-1",
      content: "It is a blue suitcase.",
      responseTimeMs: 1200,
      hintCount: 1,
      replayCount: 0,
    };
    const submitting = learningSessionPlayerReducer(createInitialPlayerState(), { type: "SUBMIT_START", submission });
    const failed = learningSessionPlayerReducer(submitting, { type: "SUBMIT_FAILURE", error: "Mất kết nối" });

    expect(failed.phase).toBe("ready");
    expect(failed.pendingSubmission).toEqual(submission);
  });

  it("clears per-turn counters after a successful response", () => {
    let state = createInitialPlayerState();
    state = learningSessionPlayerReducer(state, { type: "COUNT_HINT" });
    state = learningSessionPlayerReducer(state, { type: "COUNT_REPLAY" });
    state = learningSessionPlayerReducer(state, { type: "SUBMIT_SUCCESS", session: session(), now: 50 });

    expect(state.hintCount).toBe(0);
    expect(state.replayCount).toBe(0);
    expect(state.draft).toBe("");
  });
});
