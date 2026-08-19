import { describe, expect, it } from "vitest";
import { cleanVocabularyMeaning } from "./vocabulary";

describe("cleanVocabularyMeaning", () => {
  it.each([
    ["môn trượt băng Many people enjoy winter sports.", "môn trượt băng"],
    ["cảm thấy rất mệt I'm exhausted!", "cảm thấy rất mệt"],
    ["tuyệt vời e.g. She had a fantastic time.", "tuyệt vời"],
    ["the movement of air: gió The wind is strong.", "gió"],
    ["sóng thần The tsunami swept away villages.", "sóng thần"],
  ])("keeps only the Vietnamese meaning", (input, expected) => {
    expect(cleanVocabularyMeaning(input)).toBe(expected);
  });

  it("removes a separately stored example sentence", () => {
    expect(cleanVocabularyMeaning("môn trượt ván He enjoys skateboarding.", "He enjoys skateboarding.")).toBe("môn trượt ván");
  });
});
