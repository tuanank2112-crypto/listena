import type {
  GeneratedIntervention,
  MissionState,
  TutorTurnOutput,
} from "@/server/validation/learning-session";

export type InterventionEvaluation = {
  correct: boolean;
  normalizedAnswer: string;
};

/** Apply the server's answer check before feedback, state, and evidence diverge. */
export function applyInterventionOutcome(
  current: MissionState,
  output: TutorTurnOutput,
  evaluation: InterventionEvaluation,
  challenge: GeneratedIntervention,
): TutorTurnOutput {
  const successful = evaluation.correct;
  const shouldComplete = successful && current.phase === "BOSS";
  const phase = shouldComplete
    ? "DEBRIEF"
    : current.phase === "BOSS" || current.turnCount + 1 >= current.maxTurns - 1
      ? "BOSS"
      : successful
        ? "CONSEQUENCE"
        : "COMEBACK";

  return {
    ...output,
    npcReply: shouldComplete
      ? "You completed this practice. Think about what you learned."
      : successful
        ? phase === "BOSS"
          ? "That is correct. One final question: what is the most important detail?"
          : "That is correct. What is one more detail you can add?"
        : "That answer does not match this exercise yet. Please try it again.",
    coachMessage: successful
      ? "Bạn đã trả lời đúng bài tập. Hãy tiếp tục nhé!"
      : "Câu trả lời chưa đúng. Hãy xem lại yêu cầu và thử lại bài tập này.",
    pedagogicalAct: shouldComplete ? "REFLECT" : successful ? "CONFIRM" : "INTERVENTION",
    score: successful ? 1 : 0,
    confidence: 1,
    // Generated diagnoses and repairs evaluated the raw input without its validator.
    detectedError: null,
    intervention: successful ? null : challenge,
    statePatch: {
      phase,
      trustDelta: successful ? 6 : 0,
      evidenceDelta: successful ? 7 : 0,
      successfulTurn: successful,
      recovered: successful && current.phase === "COMEBACK",
    },
    shouldComplete,
  };
}

export function evaluateInterventionAnswer(
  type: string,
  specJson: string,
  validatorJson: string,
  answer: string,
): InterventionEvaluation {
  const normalizedAnswer = normalizeAnswer(answer);
  const spec = parseObject(specJson);
  const validator = parseObject(validatorJson);

  if (type === "CHOICE") {
    const correctIndex = validator.correctIndex;
    const options = Array.isArray(spec.options) ? spec.options : [];
    const submittedIndex = Number.parseInt(answer, 10);
    const correctOption =
      typeof correctIndex === "number" && typeof options[correctIndex] === "string"
        ? normalizeAnswer(options[correctIndex])
        : "";

    return {
      correct:
        (Number.isInteger(submittedIndex) && submittedIndex === correctIndex) ||
        (correctOption.length > 0 && normalizedAnswer === correctOption),
      normalizedAnswer,
    };
  }

  if (type === "REORDER") {
    return {
      correct:
        typeof validator.correctAnswer === "string" &&
        normalizedAnswer === normalizeAnswer(validator.correctAnswer),
      normalizedAnswer,
    };
  }

  const acceptedAnswers = Array.isArray(validator.acceptedAnswers)
    ? validator.acceptedAnswers.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return {
    correct: acceptedAnswers.some(
      (acceptedAnswer) => normalizeAnswer(acceptedAnswer) === normalizedAnswer,
    ),
    normalizedAnswer,
  };
}

export function splitIntervention(intervention: GeneratedIntervention) {
  return {
    public: {
      type: intervention.type,
      prompt: intervention.prompt,
      spec: intervention.spec,
    },
    validator: intervention.validator,
  };
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
