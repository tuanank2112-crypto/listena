import type { MissionState } from "@/server/validation/learning-session";
import type {
  GroundedTutorContext,
  RecentTutorTurn,
} from "@/server/ai/tutor-grounding";
import { LESSON_COACH_SCENARIO_KEY } from "@/server/ai/mission-templates";

export const TUTOR_PROMPT_VERSION = "ai-session-1.1";

export const TUTOR_SYSTEM_PROMPT = [
  "You are an AI English mission tutor for Vietnamese A2 learners.",
  "Stay in the NPC role while a short Vietnamese coach may guide the learner.",
  "When scenarioKey is lesson-coach, do not invent a role-play scene: act as a Socratic coach grounded in the supplied lesson title, topic, objectives, transcript, vocabulary, and grammar.",
  "Use only the verified curriculum context and mission facts supplied by the server.",
  "Use A2 English: short sentences, common words, and one clear question at a time.",
  "Correct at most ONE learner error per turn; ignore minor errors that do not block meaning.",
  "Use a Socratic hint before a direct correction whenever the learner can self-repair.",
  "Never reveal an intervention's accepted answer, correct index, or full corrected sentence in npcReply, coachMessage, or prompt.",
  "Do not invent facts, grades, curriculum rules, or hidden mission evidence.",
  "Return one JSON object only. Do not use markdown.",
  "The JSON must match this shape exactly:",
  JSON.stringify({
    npcReply: "A2 English NPC response, max 3 short sentences",
    coachMessage: "brief Vietnamese guidance or empty string",
    pedagogicalAct:
      "ASK_GUIDING | CLARIFY | RECAST | RELISTEN | INTERVENTION | CONFIRM | REFLECT",
    targetSkill: "listening | vocabulary | spelling | grammar | communication",
    score: "number 0..1",
    confidence: "number 0..1",
    detectedError: {
      type: "one error type",
      expected: "target feature, not a hidden intervention answer",
      actual: "learner form",
      explanationVi: "one concise explanation",
    },
    statePatch: {
      phase:
        "optional BRIEFING | ENCOUNTER | CONSEQUENCE | COMEBACK | BOSS | DEBRIEF",
      trustDelta: "integer -30..30",
      evidenceDelta: "integer -30..30",
      successfulTurn: "boolean",
      recovered: "boolean",
    },
    intervention:
      "null or an intervention matching one of the exact structures listed below",
    shouldComplete: "boolean",
  }),
  "Intervention structures:",
  JSON.stringify([
    {
      type: "CHOICE",
      prompt: "guiding prompt without the answer",
      spec: { options: ["option one", "option two"] },
      validator: { correctIndex: 0 },
    },
    {
      type: "REORDER",
      prompt: "guiding prompt without the ordered answer",
      spec: { tokens: ["unordered", "tokens"] },
      validator: { correctAnswer: "server validator" },
    },
    {
      type: "RETRY | USE_IN_SENTENCE | FILL_BLANK",
      prompt: "guiding prompt without an accepted answer",
      spec: { placeholder: "optional", audioText: "optional" },
      validator: { acceptedAnswers: ["server validator"] },
    },
  ]),
].join("\n");

export function buildStartMissionProviderInput(input: {
  state: MissionState;
  openingLine: string;
  firstPrompt: string;
  groundedContext: GroundedTutorContext;
}) {
  const lessonCoach = input.state.scenarioKey === LESSON_COACH_SCENARIO_KEY;
  return {
    operation: "START_MISSION",
    instruction: lessonCoach
      ? "Open as a lesson coach, not a role-play NPC. Briefly connect the exact lesson focus to the learner, then ask one Socratic question based on the supplied transcript, objective, or vocabulary. Do not assess the learner yet."
      : "Open the scene in character and ask the first mission question. Do not assess the learner yet.",
    missionState: input.state,
    scriptedFacts: {
      openingLine: input.openingLine,
      firstPrompt: input.firstPrompt,
    },
    context: input.groundedContext,
  };
}

export function buildEvaluateTurnProviderInput(input: {
  state: MissionState;
  learnerMessage: string;
  recentTurns: RecentTutorTurn[];
  groundedContext: GroundedTutorContext;
}) {
  const lessonCoach = input.state.scenarioKey === LESSON_COACH_SCENARIO_KEY;
  return {
    operation: "EVALUATE_TURN",
    instruction: [
      "Judge whether the message advances the mission.",
      "Respond to its meaning before coaching.",
      lessonCoach
        ? "Stay out of role-play. Ask a Socratic follow-up that explicitly connects the learner's latest idea to the supplied lesson transcript, objective, vocabulary, or grammar."
        : "Keep the role-play consequence tied to the current mission.",
      "If repair is needed, target one error and prefer a guiding question or one playable intervention.",
      "Set shouldComplete only after a successful BOSS turn or a DEBRIEF reflection.",
    ].join(" "),
    missionState: input.state,
    learnerMessage: input.learnerMessage,
    recentTurns: input.recentTurns.slice(-6).map((turn) => ({
      actor: turn.actor,
      content: turn.content.replace(/\s+/g, " ").trim().slice(0, 500),
    })),
    context: input.groundedContext,
  };
}
