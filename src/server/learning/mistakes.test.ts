import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildMistakeHistory, type StoredTurn } from "./mistakes";

let sequence = 0;

function learnerTurn(message: string, sessionId = "s1", goal = "Đặt món ở quán cà phê"): StoredTurn {
  sequence += 1;
  return {
    actor: "LEARNER",
    sessionId,
    sequence,
    contentJson: JSON.stringify({ message, responseTimeMs: 12_000 }),
    createdAt: new Date(`2026-09-19T10:00:${String(sequence).padStart(2, "0")}.000Z`),
    session: { goal },
  };
}

function aiTurn(detectedError: unknown, sessionId = "s1", goal = "Đặt món ở quán cà phê"): StoredTurn {
  sequence += 1;
  return {
    actor: "AI",
    sessionId,
    sequence,
    contentJson: JSON.stringify({ npcReply: "…", coachMessage: "…", detectedError }),
    createdAt: new Date(`2026-09-19T10:00:${String(sequence).padStart(2, "0")}.000Z`),
    session: { goal },
  };
}

const LIMITS = { maxFamilies: 6, maxExamplesPerFamily: 3 };

describe("buildMistakeHistory", () => {
  it("quotes the learner's own sentence, not the model's description of it", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        learnerTurn("I arrived in Monday and my flight was land at 6 o'clock."),
        aiTurn({ type: "tense", actual: "present tense with incorrect verb form", explanationVi: "Dùng quá khứ đơn." }),
      ],
      ...LIMITS,
    });
    expect(families[0].examples[0]).toMatchObject({
      learnerText: "I arrived in Monday and my flight was land at 6 o'clock.",
      highlights: [],
    });
  });

  it("points inside the sentence when the model really quoted a fragment", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        learnerTurn("My family have three childrens and we losted two bag."),
        aiTurn({ type: "grammar", actual: "have lost / two bag", explanationVi: "Dùng số nhiều." }),
      ],
      ...LIMITS,
    });
    expect(families[0].examples[0].highlights).toEqual(["two bag"]);
  });

  it("pairs each correction with the turn it answered, not with an earlier one", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        learnerTurn("first wrong sentence"),
        aiTurn({ type: "article", actual: "first", explanationVi: "A." }),
        learnerTurn("second wrong sentence"),
        aiTurn({ type: "plural", actual: "second", explanationVi: "B." }),
      ],
      ...LIMITS,
    });
    const article = families.find((family) => family.key === "article");
    const plural = families.find((family) => family.key === "plural");
    expect(article?.examples[0].learnerText).toBe("first wrong sentence");
    expect(plural?.examples[0].learnerText).toBe("second wrong sentence");
  });

  it("does not borrow a learner sentence from another session", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        learnerTurn("sentence from session one", "s-one"),
        aiTurn({ type: "article", actual: "x", explanationVi: "A." }, "s-two"),
      ],
      ...LIMITS,
    });
    expect(families[0].examples[0].learnerText).toBe("");
  });

  it("groups the learner's sentences under one family however the model named the mistake", () => {
    const families = buildMistakeHistory({
      recurringErrors: [{ errorType: "tense", count: 4, lastEvidenceId: "e1" }],
      turns: [
        learnerTurn("I lose my bag"),
        aiTurn({ type: "tense", actual: "lose", explanationVi: "Dùng quá khứ đơn: I lost." }),
        learnerTurn("yesterday I go there"),
        aiTurn({ type: "verb_tense", actual: "go", explanationVi: "Yesterday đi với quá khứ." }),
      ],
      ...LIMITS,
    });
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ key: "tense", labelVi: "Thì của động từ", count: 4 });
    expect(families[0].examples).toHaveLength(2);
  });

  it("shows the newest correction first", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        learnerTurn("older sentence"),
        aiTurn({ type: "article", actual: "older", explanationVi: "A." }),
        learnerTurn("newer sentence"),
        aiTurn({ type: "article", actual: "newer", explanationVi: "B." }),
      ],
      ...LIMITS,
    });
    expect(families[0].examples.map((example) => example.learnerText))
      .toEqual(["newer sentence", "older sentence"]);
  });

  it("keeps the count from learner memory, not from how many examples happen to be stored", () => {
    const families = buildMistakeHistory({
      recurringErrors: [{ errorType: "article", count: 9, lastEvidenceId: "e1" }],
      turns: [learnerTurn("a apple"), aiTurn({ type: "article", actual: "a apple", explanationVi: "Dùng an." })],
      ...LIMITS,
    });
    expect(families[0].count).toBe(9);
  });

  it("still shows a family that has examples but has aged out of memory", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [learnerTurn("in Monday"), aiTurn({ type: "preposition", actual: "in Monday", explanationVi: "Dùng on." })],
      ...LIMITS,
    });
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ key: "preposition", count: 1 });
  });

  it("ignores turns with no correction, unparsable content, or a malformed error", () => {
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns: [
        aiTurn(null),
        { ...aiTurn({ type: "tense", actual: "x", explanationVi: "…" }), contentJson: "not json at all" },
        { ...aiTurn(null), contentJson: JSON.stringify({ detectedError: "a string" }) },
        { ...aiTurn(null), contentJson: JSON.stringify({ detectedError: { type: 7 } }) },
        // Missing explanationVi: nothing useful to show the learner.
        aiTurn({ type: "tense", actual: "I lose" }),
      ],
      ...LIMITS,
    });
    expect(families).toEqual([]);
  });

  it("honours both limits", () => {
    const turns: StoredTurn[] = [];
    for (let index = 0; index < 5; index += 1) {
      turns.push(learnerTurn(`wrong ${index}`), aiTurn({ type: "tense", actual: "x", explanationVi: "…" }));
    }
    for (const type of ["article", "plural", "preposition", "pronoun", "spelling", "word order", "negation"]) {
      turns.push(learnerTurn("x"), aiTurn({ type, actual: "x", explanationVi: "…" }));
    }
    const families = buildMistakeHistory({
      recurringErrors: [],
      turns,
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
      turns: [],
      ...LIMITS,
    };
    const first = buildMistakeHistory(input).map((family) => family.key);
    const second = buildMistakeHistory({ ...input, recurringErrors: [...input.recurringErrors].reverse() })
      .map((family) => family.key);
    expect(first).toEqual(["tense", "article", "plural"]);
    expect(second).toEqual(first);
  });
});
