import { describe, expect, it } from "vitest";
import { TutorTurnOutputSchema } from "@/server/validation/learning-session";
import { createMissionState, getMissionTemplate } from "@/server/ai/mission-templates";
import { DeterministicMockTutorProvider } from "@/server/ai/tutor-provider-contract";
import {
  evaluateTutorTurn,
  startMission,
} from "@/server/ai/tutor-orchestrator";
import { TUTOR_SYSTEM_PROMPT } from "@/server/ai/tutor-prompts";

describe("tutor orchestrator", () => {
  const lessonContext = {
    title: "Weekend Plans",
    unit: 4,
    topic: "making plans with friends",
    learningObjectives: ["invite a friend and agree on a time"],
    transcriptExcerpt:
      "Linh asks Ben to go skateboarding on Saturday. Ben suggests meeting at ten.",
    targetVocabulary: ["skateboarding", "Saturday", "meet"],
    targetGrammar: ["be going to"],
  };

  it("starts LESSON_COACH from the actual lesson instead of lost luggage", async () => {
    const result = await startMission({ mode: "LESSON_COACH", lessonContext });

    expect(result.state).toMatchObject({
      scenarioKey: "lesson-coach",
      scenarioTitle: "Lesson Coach: Weekend Plans",
      npcRole: "Socratic English lesson coach",
      targetVocabulary: ["skateboarding", "Saturday", "meet"],
      targetGrammar: ["be going to"],
    });
    expect(result.state.learnerGoal).toContain("making plans with friends");
    expect(result.opening.npcReply).toContain("Weekend Plans");
    expect(result.opening.npcReply).toContain("Linh asks Ben");
    expect(result.opening.npcReply.toLowerCase()).not.toContain("luggage");
    expect(result.opening.npcReply.toLowerCase()).not.toContain("suitcase");
  });

  it("sends every lesson grounding field and lesson-coach instructions to the provider", async () => {
    let providerInput: Record<string, unknown> | undefined;
    const provider = new DeterministicMockTutorProvider((request) => {
      providerInput = request.input;
      return {
        npcReply: "What does Linh plan to do on Saturday?",
        coachMessage: "Hãy dựa vào đoạn hội thoại của bài.",
        pedagogicalAct: "ASK_GUIDING",
        targetSkill: "communication",
        score: 0,
        confidence: 0.9,
        detectedError: null,
        statePatch: {
          phase: "ENCOUNTER",
          trustDelta: 0,
          evidenceDelta: 0,
          successfulTurn: false,
          recovered: false,
        },
        intervention: null,
        shouldComplete: false,
      };
    });

    await startMission({ mode: "LESSON_COACH", lessonContext }, { provider });

    expect(providerInput).toMatchObject({
      operation: "START_MISSION",
      missionState: { scenarioKey: "lesson-coach" },
      context: {
        lesson: {
          title: lessonContext.title,
          topic: lessonContext.topic,
          objectives: lessonContext.learningObjectives,
          transcriptExcerpt: lessonContext.transcriptExcerpt,
          targetVocabulary: lessonContext.targetVocabulary,
          targetGrammar: lessonContext.targetGrammar,
        },
      },
    });
    expect(String(providerInput?.instruction)).toContain("not a role-play NPC");
  });

  it("uses an input-dependent Socratic fallback for LESSON_COACH follow-ups", async () => {
    const invalidProvider = new DeterministicMockTutorProvider(() => ({
      invalid: true,
    }));
    const mission = await startMission(
      { mode: "LESSON_COACH", lessonContext },
      { provider: invalidProvider },
    );
    const withTarget = await evaluateTutorTurn(
      {
        state: mission.state,
        learnerMessage: "I go skateboarding with Linh",
        lessonContext,
      },
      { provider: invalidProvider },
    );
    const differentIdea = await evaluateTutorTurn(
      {
        state: mission.state,
        learnerMessage: "Ben will meet her on Saturday",
        lessonContext,
      },
      { provider: invalidProvider },
    );

    expect(withTarget.output.pedagogicalAct).toBe("ASK_GUIDING");
    expect(withTarget.output.npcReply).toContain("skateboarding");
    expect(differentIdea.output.npcReply).toContain("Saturday");
    expect(withTarget.output.npcReply).not.toBe(differentIdea.output.npcReply);
    expect(
      `${withTarget.output.npcReply} ${differentIdea.output.npcReply}`,
    ).not.toContain("suitcase");
  });

  it("starts a grounded mission with shared-contract output", async () => {
    const result = await startMission(
      {
        scenarioKey: "cafe-order",
        lessonContext: {
          title: "Bài 1 - INTRODUCTION",
          topic: "hobbies and everyday communication",
          targetVocabulary: ["skateboarding"],
        },
      },
      { provider: new DeterministicMockTutorProvider() },
    );

    expect(result.state.scenarioKey).toBe("cafe-order");
    expect(TutorTurnOutputSchema.safeParse(result.opening).success).toBe(true);
    expect(result.meta.groundedKnowledgeIds).toEqual([]);
  });

  it("completes a deterministic BOSS turn when the learner succeeds", async () => {
    const state = createMissionState(getMissionTemplate("lost-luggage"));
    state.phase = "BOSS";

    const result = await evaluateTutorTurn(
      { state, learnerMessage: "I lost my black suitcase." },
      { provider: new DeterministicMockTutorProvider() },
    );

    expect(result.output).toMatchObject({
      statePatch: expect.objectContaining({ phase: "DEBRIEF" }),
      shouldComplete: true,
    });
  });

  it("falls back deterministically when provider output violates the schema", async () => {
    const invalidProvider = new DeterministicMockTutorProvider(() => ({
      invalid: true,
    }));
    const mission = await startMission(
      { scenarioKey: "lost-luggage" },
      { provider: invalidProvider },
    );
    const first = await evaluateTutorTurn(
      { state: mission.state, learnerMessage: "black suitcase" },
      { provider: invalidProvider },
    );
    const second = await evaluateTutorTurn(
      { state: mission.state, learnerMessage: "black suitcase" },
      { provider: invalidProvider },
    );

    expect(first).toEqual(second);
    expect(first.meta.fallbackReason).toBe("schema_validation_failed");
    expect(TutorTurnOutputSchema.safeParse(first.output).success).toBe(true);
    expect(first.output.intervention?.type).toBe("USE_IN_SENTENCE");
  });

  it("keeps a valid provider result and removes an intervention that leaks its answer", async () => {
    const leakingProvider = new DeterministicMockTutorProvider(() => ({
      npcReply: "Say: I lost my suitcase.",
      coachMessage: "",
      pedagogicalAct: "INTERVENTION",
      targetSkill: "grammar",
      score: 0.4,
      confidence: 0.9,
      detectedError: null,
      statePatch: {
        trustDelta: 0,
        evidenceDelta: 1,
        successfulTurn: false,
        recovered: false,
      },
      intervention: {
        type: "RETRY",
        prompt: "Try the sentence again.",
        spec: { placeholder: "Your sentence" },
        validator: { acceptedAnswers: ["I lost my suitcase."] },
      },
      shouldComplete: false,
    }));
    const mission = await startMission(
      { scenarioKey: "lost-luggage" },
      { provider: new DeterministicMockTutorProvider() },
    );
    const result = await evaluateTutorTurn(
      { state: mission.state, learnerMessage: "suitcase black" },
      { provider: leakingProvider },
    );

    expect(result.meta.fallbackReason).toBeUndefined();
    expect(result.output.intervention).toBeNull();
    expect(result.output.pedagogicalAct).toBe("ASK_GUIDING");
  });

  it("codifies the A2 Socratic correction policy in the prompt", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("A2 English");
    expect(TUTOR_SYSTEM_PROMPT).toContain("at most ONE learner error per turn");
    expect(TUTOR_SYSTEM_PROMPT).toContain(
      "Never reveal an intervention's accepted answer",
    );
    expect(TUTOR_SYSTEM_PROMPT).toContain(
      "Use only the verified curriculum context",
    );
  });
});
