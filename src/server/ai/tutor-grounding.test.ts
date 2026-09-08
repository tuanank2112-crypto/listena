import { describe, expect, it } from "vitest";
import { buildGroundedTutorContext, sanitizeKnowledgeText } from "@/server/ai/tutor-grounding";
import { getMissionTemplate } from "@/server/ai/mission-templates";

describe("tutor grounding", () => {
  it("removes answer keys before context is sent to the tutor", () => {
    expect(sanitizeKnowledgeText("Choose a form. Đáp án: was walking")).toBe(
      "Choose a form.",
    );
    expect(sanitizeKnowledgeText("Question. Answer key: secret")).toBe(
      "Question.",
    );
  });

  it("passes bounded validated learner memory as context instead of a conversation role", () => {
    const context = buildGroundedTutorContext({
      template: getMissionTemplate("lost-luggage"),
      learnerGoal: "Repair a grammar mistake in a complete sentence",
      learnerContext: {
        learnerMemory: {
          id: "memory-id",
          userId: "learner-id",
          goals: [{ text: "Use travel vocabulary", evidenceIds: ["evidence-id"], updatedAt: "2026-09-08T00:00:00.000Z" }],
          recurringErrors: [{ errorType: "GRAMMAR", count: 3, lastEvidenceId: "evidence-id" }],
          provenSkills: [{ skillKey: "grammar", masteryScore: 0.4, evidenceCount: 3, lastEvidenceId: "evidence-id" }],
          preferences: { topics: ["travel"] },
        },
      },
    });

    expect(context.learner.memory).toEqual({
      goals: [{ text: "Use travel vocabulary" }],
      recurringErrors: [{ errorType: "GRAMMAR", count: 3 }],
      provenSkills: [{ skillKey: "grammar", masteryScore: 0.4, evidenceCount: 3 }],
      preferredTopics: ["travel"],
    });
    expect(JSON.stringify(context.learner.memory)).not.toContain("evidence-id");
    expect(JSON.stringify(context.learner.memory)).not.toContain("learner-id");
    expect(context.mission.learnerGoal).toBe("Repair a grammar mistake in a complete sentence");
  });
});
