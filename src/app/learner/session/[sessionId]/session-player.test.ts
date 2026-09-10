import { describe, expect, it } from "vitest";
import { resolveCompletionOutcome } from "./session-player";
import type { PublicLearningSession } from "@/features/learning-session/types";

function session(phase: PublicLearningSession["state"]["phase"] = "ENCOUNTER") {
  return {
    id: "session-1",
    lessonId: null,
    mode: "MISSION",
    status: "COMPLETED",
    goal: "Ask for help",
    levelSnapshot: "A2",
    state: {
      phase,
      scenarioKey: "lost-bag",
      scenarioTitle: "Lost luggage",
      npcName: "Mia",
      npcRole: "Airport agent",
      learnerGoal: "Describe your bag",
      targetVocabulary: ["suitcase"],
      targetGrammar: [],
      trust: 40,
      evidence: 20,
      turnCount: 2,
      successfulTurns: 0,
      recoveryCount: 0,
      maxTurns: 8,
    },
    lesson: null,
    turns: [],
    evidence: [],
    interventions: [],
    summary: null,
    startedAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    completedAt: "2026-09-10T00:02:00.000Z",
  } satisfies PublicLearningSession;
}

describe("completion debrief outcome", () => {
  it("honors a server-provided partial result instead of treating it as a mission win", () => {
    const partial = { ...session(), completionOutcome: "PARTIAL" as const };

    expect(resolveCompletionOutcome(partial)).toBe("PARTIAL");
  });

  it("preserves the successful debrief when the server provides COMPLETED", () => {
    const completed = { ...session(), completionOutcome: "COMPLETED" as const };

    expect(resolveCompletionOutcome(completed)).toBe("COMPLETED");
  });

  it("uses DEBRIEF as the only legacy-success fallback and otherwise avoids a trophy", () => {
    expect(resolveCompletionOutcome(session("DEBRIEF"))).toBe("COMPLETED");
    expect(resolveCompletionOutcome(session("ENCOUNTER"))).toBe("PARTIAL");
  });
});
