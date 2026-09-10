import { describe, expect, it, vi } from "vitest";
import { AIRequestBudgetError } from "@/server/ai/errors";

vi.mock("@/server/personalized-learning/service", () => ({
  PersonalizedLearningError: class PersonalizedLearningError extends Error {},
}));

import { personalizedLearningErrorResponse } from "./http";

describe("personalized learning error response", () => {
  it("returns the shared AI reservation limit as a retryable 429", async () => {
    const response = personalizedLearningErrorResponse(
      new AIRequestBudgetError({ reason: "COOLDOWN", retryAfterSeconds: 12 }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    await expect(response.json()).resolves.toMatchObject({
      code: "AI_REQUEST_LIMIT",
      retryAfterSeconds: 12,
    });
  });
});
