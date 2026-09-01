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

function defaultMockResponse(request: TutorProviderRequest): TutorTurnOutput {
  const rawMessage = request.input.learnerMessage;
  const learnerMessage =
    typeof rawMessage === "string" ? rawMessage.trim() : "";
  const successful =
    request.purpose === "start_mission" ||
    learnerMessage.split(/\s+/).length >= 4;

  return {
    npcReply:
      request.purpose === "start_mission"
        ? "Hello! Tell me what you need today."
        : successful
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
      phase: "ENCOUNTER",
      trustDelta: successful ? 6 : 0,
      evidenceDelta: successful ? 7 : 1,
      successfulTurn: successful,
      recovered: false,
    },
    intervention: null,
    shouldComplete: false,
  };
}
