import { describe, expect, it } from "vitest";
import { GeneratedInterventionSchema } from "./learning-session";

describe("generated CHOICE validation", () => {
  it("rejects an index outside the actual options", () => {
    expect(GeneratedInterventionSchema.safeParse({
      type: "CHOICE", prompt: "Choose", spec: { options: ["A", "B"] },
      validator: { correctIndex: 2 },
    }).success).toBe(false);
  });

  it.each([0, 1])("accepts available option %s", (correctIndex) => {
    expect(GeneratedInterventionSchema.safeParse({
      type: "CHOICE", prompt: "Choose", spec: { options: ["A", "B"] },
      validator: { correctIndex },
    }).success).toBe(true);
  });
});
