import { describe, expect, it } from "vitest";
import {
  aggregateRecurringErrors,
  canonicalErrorType,
  describeErrorType,
  describeRawErrorType,
} from "./error-taxonomy";

describe("canonicalErrorType", () => {
  it("folds the spellings a model actually produces for one mistake", () => {
    // "tense" is what production returned on 2026-09-19; the others are the
    // shapes the same model reaches for on other turns.
    const keys = ["tense", "verb_tense", "Verb Tense", "VERB-TENSE", "past simple", "past tense", "tenses"]
      .map(canonicalErrorType);
    expect(new Set(keys)).toEqual(new Set(["tense"]));
  });

  it("keeps subject-verb agreement out of the verb-form family", () => {
    expect(canonicalErrorType("subject verb agreement")).toBe("agreement");
    expect(canonicalErrorType("verb form")).toBe("verb-form");
  });

  it("recognises the families a Vietnamese A1-A2 learner meets most", () => {
    const cases: Array<[string, string]> = [
      ["article", "article"],
      ["missing article", "article"],
      ["plural", "plural"],
      ["preposition error", "preposition"],
      ["word order", "word-order"],
      ["wrong word", "word-choice"],
      ["spelling", "spelling"],
      ["pronoun", "pronoun"],
      ["question formation", "question-form"],
      ["comparative", "comparative"],
      ["phonological", "pronunciation"],
      ["capitalization", "punctuation"],
    ];
    for (const [raw, expected] of cases) {
      expect(canonicalErrorType(raw), raw).toBe(expected);
    }
  });

  it("maps the database's own ErrorType enum onto the same families", () => {
    expect(canonicalErrorType("MISSING_WORD")).toBe("missing-word");
    expect(canonicalErrorType("EXTRA_WORD")).toBe("extra-word");
    expect(canonicalErrorType("WORD_FORM")).toBe("verb-form");
    expect(canonicalErrorType("FUNCTION_WORD")).toBe("preposition");
    expect(canonicalErrorType("PHONOLOGICAL")).toBe("pronunciation");
    expect(canonicalErrorType("SEGMENTATION")).toBe("punctuation");
    expect(canonicalErrorType("SPELLING")).toBe("spelling");
    expect(canonicalErrorType("VOCABULARY")).toBe("word-choice");
  });

  it("does not let a stem claim an unrelated word", () => {
    // "intense" must not become a tense problem, nor "extraction" an extra word.
    expect(canonicalErrorType("intense")).toBe("intense");
    expect(canonicalErrorType("extraction")).toBe("extraction");
  });

  it("keeps two different unrecognised mistakes apart", () => {
    // Merging them would invent a recurrence the learner never had and send
    // them to practise the wrong thing.
    expect(canonicalErrorType("idiom misuse")).toBe("idiom-misuse");
    expect(canonicalErrorType("discourse marker")).toBe("discourse-marker");
    expect(canonicalErrorType("idiom misuse")).not.toBe(canonicalErrorType("discourse marker"));
  });

  it("treats an empty or punctuation-only type as no error at all", () => {
    expect(canonicalErrorType("")).toBeNull();
    expect(canonicalErrorType("   ")).toBeNull();
    expect(canonicalErrorType("---")).toBeNull();
    expect(canonicalErrorType(null)).toBeNull();
    expect(canonicalErrorType(undefined)).toBeNull();
  });
});

describe("describeErrorType", () => {
  it("gives a Vietnamese label, never the raw English type", () => {
    expect(describeErrorType("tense").labelVi).toBe("Thì của động từ");
    expect(describeRawErrorType("verb_tense").labelVi).toBe("Thì của động từ");
  });

  it("falls back to a neutral Vietnamese label for an unknown key", () => {
    const family = describeErrorType("idiom-misuse");
    expect(family.labelVi).toBe("Lỗi khác");
    // The fallback must not leak English jargon into a Vietnamese sentence.
    expect(family.labelVi).not.toMatch(/[a-z]{4,}/);
  });
});

describe("aggregateRecurringErrors", () => {
  it("adds up counts that were split across spellings of one mistake", () => {
    // The bug this exists for: 2 + 2 never reached the planner's threshold of 3.
    const aggregated = aggregateRecurringErrors([
      { errorType: "tense", count: 2, lastEvidenceId: "e1" },
      { errorType: "verb_tense", count: 2, lastEvidenceId: "e2" },
    ]);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]).toMatchObject({ key: "tense", count: 4, labelVi: "Thì của động từ" });
    expect(aggregated[0].rawTypes).toEqual(["tense", "verb_tense"]);
  });

  it("takes the evidence id from the largest member, not from array order", () => {
    const aggregated = aggregateRecurringErrors([
      { errorType: "tense", count: 1, lastEvidenceId: "small" },
      { errorType: "past simple", count: 5, lastEvidenceId: "large" },
    ]);
    expect(aggregated[0].lastEvidenceId).toBe("large");
  });

  it("orders by count, then by key, so two reads agree", () => {
    const rows = [
      { errorType: "article", count: 3, lastEvidenceId: "a" },
      { errorType: "tense", count: 7, lastEvidenceId: "b" },
      { errorType: "plural", count: 3, lastEvidenceId: "c" },
    ];
    const first = aggregateRecurringErrors(rows).map((row) => row.key);
    const second = aggregateRecurringErrors([...rows].reverse()).map((row) => row.key);
    expect(first).toEqual(["tense", "article", "plural"]);
    expect(second).toEqual(first);
  });

  it("drops entries with no evidence to point at", () => {
    expect(aggregateRecurringErrors([
      { errorType: "tense", count: 9, lastEvidenceId: "" },
    ])).toEqual([]);
  });

  it("keeps unrecognised mistakes separate instead of pooling them", () => {
    const aggregated = aggregateRecurringErrors([
      { errorType: "idiom misuse", count: 2, lastEvidenceId: "e1" },
      { errorType: "discourse marker", count: 2, lastEvidenceId: "e2" },
    ]);
    expect(aggregated).toHaveLength(2);
    expect(aggregated.every((row) => row.count === 2)).toBe(true);
  });
});
