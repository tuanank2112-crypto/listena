import type { TutorTurnOutput } from "@/server/validation/learning-session";

export type TutorProviderPurpose = "start_mission" | "evaluate_turn";

export interface TutorProviderRequest {
  purpose: TutorProviderPurpose;
  systemPrompt: string;
  input: Record<string, unknown>;
}

export interface TutorProviderResponse {
  output: unknown;
  provider: string;
  model?: string;
}

export interface TutorTurnProvider {
  readonly providerName: string;
  readonly modelName?: string;
  generate(request: TutorProviderRequest): Promise<TutorProviderResponse>;
}

export type MockTutorResponder = (
  request: TutorProviderRequest,
) => TutorTurnOutput | unknown;

/** A zero-latency provider for contract tests and local deterministic demos. */
export class DeterministicMockTutorProvider implements TutorTurnProvider {
  readonly providerName = "mock";
  readonly modelName = "deterministic-tutor-v1";

  constructor(
    private readonly responder: MockTutorResponder = defaultMockResponse,
  ) {}

  async generate(
    request: TutorProviderRequest,
  ): Promise<TutorProviderResponse> {
    return {
      output: this.responder(request),
      provider: this.providerName,
      model: this.modelName,
    };
  }
}

type MissionStateInput = {
  targetVocabulary?: unknown;
  maxTurns?: unknown;
  phase?: unknown;
};

function defaultMockResponse(request: TutorProviderRequest): TutorTurnOutput {
  if (request.purpose === "start_mission") {
    return {
      npcReply: "Hello! Tell me what you need today.",
      coachMessage: "",
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
  }

  const rawMessage = request.input.learnerMessage;
  const learnerMessage =
    typeof rawMessage === "string" ? rawMessage.trim() : "";
  const rawState = (request.input as { missionState?: MissionStateInput }).missionState;
  const targetVocabulary = Array.isArray(rawState?.targetVocabulary)
    ? rawState.targetVocabulary.filter((item): item is string => typeof item === "string")
    : [];
  const phase = rawState?.phase === "BOSS" || rawState?.phase === "DEBRIEF"
    ? rawState.phase
    : null;
  const hasTargetWord = targetVocabulary.some((word) =>
    learnerMessage.toLowerCase().includes(word.toLowerCase()),
  );
  const successful =
    hasTargetWord && learnerMessage.split(/\s+/).length >= 4;

  return {
    npcReply: successful
      ? "Thanks. That helps me understand. What happened next?"
      : "I need one more detail. Can you use a full sentence?",
    coachMessage: successful
      ? "Tốt lắm, hãy tiếp tục bằng một câu ngắn."
      : "Hãy thêm chủ ngữ và động từ.",
    pedagogicalAct: successful ? "CONFIRM" : "ASK_GUIDING",
    targetSkill: "communication",
    score: successful ? 0.82 : 0.35,
    confidence: 0.9,
    detectedError: null,
    statePatch: {
      phase: successful && phase === "BOSS" ? "DEBRIEF" : successful ? "CONSEQUENCE" : "COMEBACK",
      trustDelta: successful ? 6 : 0,
      evidenceDelta: successful ? 7 : 1,
      successfulTurn: successful,
      recovered: false,
    },
      intervention: null,
    shouldComplete: successful && phase === "BOSS",
  };
}
