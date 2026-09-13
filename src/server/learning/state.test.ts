import { describe, expect, it } from "vitest";
import type { TutorTurnOutput } from "@/server/validation/learning-session";
import {
  applyTutorTurn,
  getAiClientTurnId,
  getEventClientTurnId,
  nextTurnSequence,
} from "@/server/learning/state";

const state = {
  phase: "ENCOUNTER" as const,
  scenarioKey: "lost-luggage",
  scenarioTitle: "Lost luggage",
  npcName: "Mia",
  npcRole: "Airport agent",
  learnerGoal: "Find a missing suitcase",
  targetVocabulary: ["suitcase"],
  targetGrammar: ["past simple"],
  trust: 95,
  evidence: 5,
  turnCount: 2,
  successfulTurns: 1,
  recoveryCount: 0,
  maxTurns: 8,
};

function output(overrides: Partial<TutorTurnOutput> = {}): TutorTurnOutput {
  return {
    npcReply: "Can you describe it?",
    coachMessage: "",
    pedagogicalAct: "ASK_GUIDING",
    targetSkill: "communication",
    score: 0.8,
    confidence: 0.9,
    detectedError: null,
    statePatch: {
      trustDelta: 20,
      evidenceDelta: -20,
      successfulTurn: true,
      recovered: true,
    },
    intervention: null,
    shouldComplete: false,
    ...overrides,
  };
}

describe("learning session state", () => {
  it("applies tutor deltas, counters, and score bounds without mutation", () => {
    const result = applyTutorTurn(state, output());

    expect(result).toMatchObject({
      trust: 100,
      evidence: 0,
      turnCount: 3,
      successfulTurns: 2,
      recoveryCount: 1,
    });
    expect(state).toMatchObject({ trust: 95, evidence: 5, turnCount: 2 });
  });

  it("moves to debrief when the tutor recommends completion", () => {
    expect(applyTutorTurn(state, output({ shouldComplete: true })).phase).toBe("DEBRIEF");
  });

  it("ends as partial at the server-owned turn budget even when the tutor does not request completion", () => {
    const result = applyTutorTurn({ ...state, turnCount: 4, maxTurns: 5 }, output());

    expect(result).toMatchObject({
      phase: "DEBRIEF",
      turnCount: 5,
      completionOutcome: "PARTIAL",
    });
  });
});

describe("idempotency helpers", () => {
  it("derives stable, namespaced turn ids", () => {
    expect(getAiClientTurnId("client-turn-123")).toBe("ai:client-turn-123");
    expect(getEventClientTurnId("client-event-123")).toBe("event:client-event-123");
  });

  it("increments sequence from an empty or populated session", () => {
    expect(nextTurnSequence(undefined)).toBe(1);
    expect(nextTurnSequence(8)).toBe(9);
  });
});
