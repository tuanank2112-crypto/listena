import { describe, expect, it } from "vitest";
import { groupDueFlashcardsByVocabulary } from "./group-due-flashcards";

describe("groupDueFlashcardsByVocabulary (Plan13 L5 display grouping)", () => {
  it("keeps the first (oldest) card per vocabularyItemId and preserves order", () => {
    const cards = [
      { id: "c1", front: "passport", vocabularyItem: { id: "v-passport" } },
      { id: "c2", front: "gate", vocabularyItem: { id: "v-gate" } },
      { id: "c3", front: "passport", vocabularyItem: { id: "v-passport" } },
      { id: "c4", front: "passport", vocabularyItem: { id: "v-passport" } },
      { id: "c5", front: "ticket", vocabularyItem: { id: "v-ticket" } },
    ];

    const grouped = groupDueFlashcardsByVocabulary(cards);

    expect(grouped.map((card) => card.id)).toEqual(["c1", "c2", "c5"]);
    expect(cards).toHaveLength(5);
  });

  it("returns an empty list for no due cards", () => {
    expect(groupDueFlashcardsByVocabulary([])).toEqual([]);
  });
});
