import type { GeneratedIntervention } from "@/server/validation/learning-session";

export type InterventionEvaluation = {
  correct: boolean;
  normalizedAnswer: string;
};

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
