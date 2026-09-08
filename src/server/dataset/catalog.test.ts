import { describe, expect, it } from "vitest";
import { getDatasetUnit, getUnitLearningContext, searchKnowledge } from "./catalog";

describe("dataset catalog", () => {
  it("maps imported lesson titles to units", () => {
    expect(getDatasetUnit("Bài 3 - ADVENTURE")).toBe(3);
    expect(getDatasetUnit("Unknown lesson")).toBeNull();
  });

  it("returns grammar only from the requested unit", () => {
    const context = getUnitLearningContext(5);
    expect(context?.grammar.length).toBeGreaterThan(0);
    expect(context?.grammar.some((topic) => /conditional/i.test(topic.title))).toBe(true);
  });

  it("ranks matching vocabulary inside the unit", () => {
    const results = searchKnowledge("What does skateboarding mean?", 1, 3);
    expect(results[0]?.title.toLowerCase()).toBe("skateboarding");
    expect(results.every((result) => result.unit === 1)).toBe(true);
  });

  it("rejects stop-word-only queries", () => {
    expect(searchKnowledge("something maybe later", 1)).toEqual([]);
    expect(searchKnowledge("Tell me a joke please", 1)).toEqual([]);
  });
});
