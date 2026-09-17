import { describe, expect, it } from "vitest";
import {
  CreateLearningSessionSchema,
  LearningEventSchema,
  SubmitLearningTurnSchema,
} from "./learning-session";

// Plan13 SPEC-P132 §9 and SPEC-P131 §3.
describe("learning session request schemas", () => {
  it("rejects client turn ids that would collide with server namespaces", () => {
    for (const clientTurnId of ["ai:12345678", "event:12345678", "system:12345678", "AI:12345678"]) {
      expect(SubmitLearningTurnSchema.safeParse({ clientTurnId, content: "hello" }).success).toBe(false);
    }
    expect(SubmitLearningTurnSchema.safeParse({ clientTurnId: "turn-12345678", content: "hello" }).success).toBe(true);
    expect(LearningEventSchema.safeParse({ type: "HINT", clientEventId: "ai:12345678" }).success).toBe(false);
    expect(LearningEventSchema.safeParse({ type: "HINT", clientEventId: "hint-12345678" }).success).toBe(true);
  });

  it("accepts the optional replaceActive flag on a start request", () => {
    const parsed = CreateLearningSessionSchema.safeParse({
      clientStartId: "00000000-0000-4000-8000-000000000001",
      mode: "MISSION",
      scenarioKey: "cafe-order",
      replaceActive: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.replaceActive).toBe(true);
  });
});
