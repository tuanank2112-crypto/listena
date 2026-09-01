import { describe, expect, it } from "vitest";
import { sanitizeKnowledgeText } from "@/server/ai/tutor-grounding";

describe("tutor grounding", () => {
  it("removes answer keys before context is sent to the tutor", () => {
    expect(sanitizeKnowledgeText("Choose a form. Đáp án: was walking")).toBe(
      "Choose a form.",
    );
    expect(sanitizeKnowledgeText("Question. Answer key: secret")).toBe(
      "Question.",
    );
  });
});
