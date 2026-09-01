import { describe, expect, it } from "vitest";
import {
  evaluateInterventionAnswer,
  normalizeAnswer,
  splitIntervention,
} from "@/server/learning/intervention";
import type { GeneratedIntervention } from "@/server/validation/learning-session";

describe("intervention validation", () => {
  it("accepts a choice by index or normalized option text", () => {
    const spec = JSON.stringify({ options: ["a bag", "A suitcase!"] });
    const validator = JSON.stringify({ correctIndex: 1 });

    expect(evaluateInterventionAnswer("CHOICE", spec, validator, "1").correct).toBe(true);
    expect(
      evaluateInterventionAnswer("CHOICE", spec, validator, "a suitcase").correct,
    ).toBe(true);
  });

  it("validates reordered and accepted text without leaking validators", () => {
    expect(
      evaluateInterventionAnswer(
        "REORDER",
        JSON.stringify({ tokens: ["my", "bag"] }),
        JSON.stringify({ correctAnswer: "My bag." }),
        "my bag",
      ).correct,
    ).toBe(true);
    expect(
      evaluateInterventionAnswer(
        "FILL_BLANK",
        "{}",
        JSON.stringify({ acceptedAnswers: ["lost", "missing"] }),
        "Missing!",
      ).correct,
    ).toBe(true);
  });

  it("normalizes punctuation, case, and repeated whitespace", () => {
    expect(normalizeAnswer("  IT\u2019S   BLUE! ")).toBe("it's blue");
  });

  it("keeps answer validators out of the public intervention contract", () => {
    const generated: GeneratedIntervention = {
      type: "FILL_BLANK",
      prompt: "Complete the sentence.",
      spec: { placeholder: "One word" },
      validator: { acceptedAnswers: ["missing"] },
    };

    const intervention = splitIntervention(generated);

    expect(intervention.public).toEqual({
      type: "FILL_BLANK",
      prompt: "Complete the sentence.",
      spec: { placeholder: "One word" },
    });
    expect(intervention.public).not.toHaveProperty("validator");
    expect(intervention.validator).toEqual({ acceptedAnswers: ["missing"] });
  });
});
