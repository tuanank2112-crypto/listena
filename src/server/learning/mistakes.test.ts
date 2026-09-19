import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildMistakeHistory, type StoredAiTurn } from "./mistakes";

function aiTurn(detectedError: unknown, overrides: Partial<StoredAiTurn> = {}): StoredAiTurn {
  return {
    contentJson: JSON.stringify({ npcReply: "…", coachMessage: "…", detectedError }),
    createdAt: new Date("2026-09-19T10:00:00.000Z"),
    session: { goal: "Đặt món ở quán cà phê" },
    ...overrides,
  };
}

const LIMITS = { maxFamilies: 6, maxExamplesPerFamily: 3 };

describe("buildMistakeHistory", () => {
  it("groups the learner's own sentences under one family however the model named the mistake", () => {
    const families = buildMistakeHistory({
      recurringErrors: [{ errorType: "tense", count: 4, lastEvidenceId: "e1" }],
      aiTurns: [
        aiTurn({ type: "tense", actual: "I lose", explanationVi: "Dùng quá khứ đơn: I lost." }),
        aiTurn({ type: "verb_tense", actual: "I go", explanationVi: "Yesterday đi với quá khứ." }),
      ],
      ...LIMITS,
    });

    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ key: "tense", labelVi: "Thì của động từ", count: 4 });
    expect(families[0].examples.map((example) => example.actual)).toEqual(["I lose", "I go"]);
  });

  it("keeps the count from learner memory, not from how many examples happen to be stored", () => {
    // The page and the planner must never tell different stories about the
    // same learner.
    const families = buildMistakeHistory({
      recurringErrors: [{ errorType: "article", count: 9, lastEvidenceId: "e1" }],
      aiTurns: [aiTurn({ type: "article", actual: "a apple", explanationVi: "Trước nguyên âm dùng an." })],
      ...LIMITS,
    });
    expect(families[0].count).toBe(9);
  });

  it("still shows a family that has examples but has aged out of memory", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      aiTurns: [aiTurn({ type: "preposition", actual: "in Monday", explanationVi: "Thứ trong tuần dùng on." })],
      ...LIMITS,
    });
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ key: "preposition", count: 1 });
  });

  it("carries the Coach's own Vietnamese explanation and the session it happened in", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      aiTurns: [aiTurn(
        { type: "plural", actual: "two coffee", explanationVi: "Hai cái trở lên: two coffees." },
        { session: { goal: "Báo thất lạc hành lý" } },
      )],
      ...LIMITS,
    });
    expect(families[0].examples[0]).toMatchObject({
      actual: "two coffee",
      explanationVi: "Hai cái trở lên: two coffees.",
      sessionGoal: "Báo thất lạc hành lý",
    });
  });

  it("ignores turns with no correction, unparsable content, or a malformed error", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      aiTurns: [
        aiTurn(null),
        { contentJson: "not json at all", createdAt: new Date(), session: { goal: "g" } },
        { contentJson: JSON.stringify({ detectedError: "a string" }), createdAt: new Date(), session: { goal: "g" } },
        { contentJson: JSON.stringify({ detectedError: { type: 7 } }), createdAt: new Date(), session: { goal: "g" } },
        // Missing explanationVi: nothing useful to show the learner.
        aiTurn({ type: "tense", actual: "I lose" }),
      ],
      ...LIMITS,
    });
    expect(families).toEqual([]);
  });

  it("honours both limits", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      aiTurns: [
        ...Array.from({ length: 5 }, (_, index) =>
          aiTurn({ type: "tense", actual: `wrong ${index}`, explanationVi: "…" })),
        ...["article", "plural", "preposition", "pronoun", "spelling", "word order", "negation"].map((type) =>
          aiTurn({ type, actual: "x", explanationVi: "…" })),
      ],
      maxFamilies: 4,
      maxExamplesPerFamily: 2,
    });
    expect(families).toHaveLength(4);
    expect(families[0].key).toBe("tense");
    expect(families[0].examples).toHaveLength(2);
  });

  it("puts the most repeated family first and stays stable across reads", () => {
    const input = {
      recurringErrors: [
        { errorType: "article", count: 2, lastEvidenceId: "e1" },
        { errorType: "tense", count: 7, lastEvidenceId: "e2" },
        { errorType: "plural", count: 2, lastEvidenceId: "e3" },
      ],
      aiTurns: [],
      ...LIMITS,
    };
    const first = buildMistakeHistory(input).map((family) => family.key);
    const second = buildMistakeHistory({ ...input, recurringErrors: [...input.recurringErrors].reverse() })
      .map((family) => family.key);
    expect(first).toEqual(["tense", "article", "plural"]);
    expect(second).toEqual(first);
  });
});
