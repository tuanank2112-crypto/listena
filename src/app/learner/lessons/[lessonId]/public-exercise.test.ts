import { describe, expect, it } from "vitest";
import {
  toPublicExerciseMetadata,
  toPublicExerciseMetadataJson,
  toPublicLastAttemptMap,
} from "./public-exercise";

const importedMetadata = JSON.stringify({
  unit: 3,
  exerciseNumber: 2,
  answerMode: "guided",
  content: ["Line one", "Line two"],
  answers: ["passport", "gate"],
  sourceAnswers: ["Please show your passport"],
  correctAnswer: "Please show your passport",
  hiddenAnswerText: "should never leak",
});

describe("toPublicExerciseMetadata (Plan13 L2: no answers to the client)", () => {
  it("keeps only content/answerMode/unit/exerciseNumber", () => {
    expect(toPublicExerciseMetadata(importedMetadata)).toEqual({
      unit: 3,
      exerciseNumber: 2,
      answerMode: "guided",
      content: ["Line one", "Line two"],
    });
  });

  it("never serializes answers, sourceAnswers or correctAnswer", () => {
    const json = toPublicExerciseMetadataJson(importedMetadata) ?? "";
    expect(json).not.toContain("answers");
    expect(json).not.toContain("sourceAnswers");
    expect(json).not.toContain("correctAnswer");
    expect(json).not.toContain("passport");
    expect(json).not.toContain("should never leak");
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(["answerMode", "content", "exerciseNumber", "unit"]);
  });

  it("returns an empty projection for null, malformed or non-object metadata", () => {
    expect(toPublicExerciseMetadata(null)).toEqual({});
    expect(toPublicExerciseMetadata(undefined)).toEqual({});
    expect(toPublicExerciseMetadata("{not json")).toEqual({});
    expect(toPublicExerciseMetadata("[1,2]")).toEqual({});
    expect(toPublicExerciseMetadataJson("{}")).toBeNull();
  });

  it("drops fields of the wrong type instead of forwarding them", () => {
    expect(toPublicExerciseMetadata({ answerMode: "secret", content: "not-an-array", unit: "3" })).toEqual({});
    expect(toPublicExerciseMetadata({ content: ["ok", 5, null] })).toEqual({ content: ["ok"] });
  });
});

describe("toPublicLastAttemptMap", () => {
  it("projects only the score, never resultJson or normalized text", () => {
    const map = toPublicLastAttemptMap([
      { exerciseId: "ex-1", score: 80, resultJson: "{...}", normalizedAnswer: "x" } as never,
      { exerciseId: "ex-2", score: null },
    ]);
    expect(map).toEqual({ "ex-1": { score: 80 }, "ex-2": { score: null } });
    expect(JSON.stringify(map)).not.toContain("resultJson");
  });
});
