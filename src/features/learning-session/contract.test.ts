import { describe, expectTypeOf, it } from "vitest";
import type { LearningSessionDto } from "@/server/learning/dto";
import type { PublicLearningSession } from "./types";

describe("learning session API contract", () => {
  it("keeps the server DTO assignable to the client session contract", () => {
    expectTypeOf<LearningSessionDto>().toExtend<PublicLearningSession>();
  });
});
