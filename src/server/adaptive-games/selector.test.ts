import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_GAME_MAX_ROUNDS,
  adaptiveDifficulty,
  buildAdaptiveGameRounds,
  selectAdaptiveGameCandidates,
  type AdaptiveGameCandidate,
} from "./selector";
import { parsePublicAdaptiveGameRound } from "./contracts";

const now = new Date("2026-09-10T10:00:00.000Z");

function candidate(id: string, overrides: Partial<AdaptiveGameCandidate> = {}): AdaptiveGameCandidate {
  return {
    id,
    displayText: `word-${id}`,
    meaningVi: `nghĩa-${id}`,
    ipa: null,
    exampleSentence: null,
    audioUrl: null,
    cefrLevel: "A2",
    ...overrides,
  };
}

function tokenFactory() {
  let value = 1;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

describe("adaptive game selector", () => {
  it("prioritizes due words, recent misses, then low mastery deterministically", () => {
    const selected = selectAdaptiveGameCandidates([
      candidate("due", { mastery: { masteryScore: 0.9, nextReviewAt: new Date(now.getTime() - 1) } }),
      candidate("missed", { mastery: { masteryScore: 0.9, nextReviewAt: new Date(now.getTime() + 86_400_000) }, recentEvidence: { score: 0, createdAt: now } }),
      candidate("weak", { mastery: { masteryScore: 0.1, nextReviewAt: null } }),
      candidate("fresh"),
    ], now, 4);

    expect(selected.map((item) => item.id)).toEqual(["due", "missed", "fresh", "weak"]);
  });

  it("breaks otherwise-equal selections toward the learner's CEFR band", () => {
    const selected = selectAdaptiveGameCandidates([
      candidate("far", { levelDistance: 3 }),
      candidate("near", { levelDistance: 0 }),
    ], now, 2);

    expect(selected.map((item) => item.id)).toEqual(["near", "far"]);
  });

  it("keeps the game form but raises the option count with learner difficulty", () => {
    const pool = Array.from({ length: 8 }, (_, index) => candidate(String(index + 1)));
    const selected = selectAdaptiveGameCandidates(pool, now, ADAPTIVE_GAME_MAX_ROUNDS);

    const lowRound = buildAdaptiveGameRounds({
      mode: "QUIZ",
      selected,
      candidatePool: pool,
      difficulty: adaptiveDifficulty(0),
      tokenFactory: tokenFactory(),
    })[0];
    const highRound = buildAdaptiveGameRounds({
      mode: "QUIZ",
      selected,
      candidatePool: pool,
      difficulty: adaptiveDifficulty(1),
      tokenFactory: tokenFactory(),
    })[0];

    const lowContent = parsePublicAdaptiveGameRound(lowRound.publicJson);
    const highContent = parsePublicAdaptiveGameRound(highRound.publicJson);
    expect(lowContent.kind).toBe("quiz");
    expect(highContent.kind).toBe("quiz");
    if (lowContent.kind === "quiz" && highContent.kind === "quiz") {
      expect(lowContent.options).toHaveLength(3);
      expect(highContent.options).toHaveLength(5);
    }
  });

  it("does not place the quiz answer at a predictable first option", () => {
    const pool = Array.from({ length: 8 }, (_, index) => candidate(String(index + 1)));
    const selected = selectAdaptiveGameCandidates(pool, now, ADAPTIVE_GAME_MAX_ROUNDS);
    const [round] = buildAdaptiveGameRounds({
      mode: "QUIZ",
      selected,
      candidatePool: pool,
      difficulty: adaptiveDifficulty(0),
      tokenFactory: tokenFactory(),
      random: () => 0,
    });
    const content = parsePublicAdaptiveGameRound(round.publicJson);

    expect(content.kind).toBe("quiz");
    if (content.kind === "quiz") {
      expect(content.options[0]).not.toBe("nghĩa-1");
      expect(content.options.at(-1)).toBe("nghĩa-1");
    }
  });

  it("does not serialize server validators or spell answers into public round JSON", () => {
    const pool = Array.from({ length: 8 }, (_, index) => candidate(String(index + 1)));
    const selected = selectAdaptiveGameCandidates(pool, now, ADAPTIVE_GAME_MAX_ROUNDS);
    const [spellRound] = buildAdaptiveGameRounds({
      mode: "SPELL",
      selected,
      candidatePool: pool,
      difficulty: 0.5,
      tokenFactory: tokenFactory(),
    });

    expect(spellRound.publicJson).not.toContain("validator");
    expect(spellRound.publicJson).not.toContain("normalizedExpectedAnswer");
    expect(spellRound.publicJson).not.toContain(selected[0].displayText);
    expect(spellRound.validatorJson).toContain("normalizedExpectedAnswer");
  });

  it("uses opaque match tokens and scales matching distractors without exposing the pair", () => {
    const pool = Array.from({ length: 8 }, (_, index) => candidate(String(index + 1)));
    const selected = selectAdaptiveGameCandidates(pool, now, ADAPTIVE_GAME_MAX_ROUNDS);
    const [matchRound] = buildAdaptiveGameRounds({
      mode: "MATCH",
      selected,
      candidatePool: pool,
      difficulty: adaptiveDifficulty(1),
      tokenFactory: tokenFactory(),
    });
    const content = parsePublicAdaptiveGameRound(matchRound.publicJson);

    expect(content.kind).toBe("match");
    if (content.kind === "match") {
      expect(content.cards).toHaveLength(5);
      expect(content.cards.filter((card) => card.kind === "word")).toHaveLength(1);
      expect(content.cards.filter((card) => card.kind === "meaning")).toHaveLength(4);
    }
    expect(matchRound.publicJson).not.toContain("expectedTokens");
    expect(matchRound.validatorJson).toContain("expectedTokens");
  });
});

describe("adaptive game distractors (Plan13 G1: seeded, not alphabetical)", () => {
  const pool = Array.from({ length: 40 }, (_, index) => candidate(String(index + 1).padStart(2, "0")));

  function distractorSet(seed: string, position: number) {
    const target = { ...pool[0], priority: 1 };
    const selected = Array.from({ length: position + 1 }, () => target);
    const rounds = buildAdaptiveGameRounds({
      mode: "QUIZ",
      selected,
      candidatePool: pool,
      difficulty: adaptiveDifficulty(1),
      tokenFactory: tokenFactory(),
      seed,
    });
    const content = parsePublicAdaptiveGameRound(rounds[position].publicJson);
    if (content.kind !== "quiz") throw new Error("expected quiz");
    return new Set(content.options.filter((option) => option !== "nghĩa-01"));
  }

  it("gives two consecutive rounds with the same target different distractor sets (> 90% of 20 seeds)", () => {
    let different = 0;
    for (let trial = 0; trial < 20; trial += 1) {
      const seed = `run-${trial}`;
      const first = distractorSet(seed, 0);
      const second = distractorSet(seed, 1);
      expect(first.size).toBe(4);
      expect(second.size).toBe(4);
      const same = first.size === second.size && [...first].every((option) => second.has(option));
      if (!same) different += 1;
    }
    expect(different / 20).toBeGreaterThan(0.9);
  });

  it("is reproducible for the same run seed and round index", () => {
    expect([...distractorSet("run-a", 0)].sort()).toEqual([...distractorSet("run-a", 0)].sort());
    expect([...distractorSet("run-a", 0)].sort()).not.toEqual([...distractorSet("run-b", 0)].sort());
  });

  it("never draws the alphabetical head of the pool for every round", () => {
    const alphabeticalHead = new Set(["nghĩa-02", "nghĩa-03", "nghĩa-04", "nghĩa-05"]);
    const rounds = Array.from({ length: 6 }, (_, position) => distractorSet("run-z", position));
    const allAlphabetical = rounds.every((set) => [...set].every((option) => alphabeticalHead.has(option)));
    expect(allAlphabetical).toBe(false);
  });

  it("still contains the correct meaning exactly once and only distinct options", () => {
    const [round] = buildAdaptiveGameRounds({
      mode: "QUIZ",
      selected: [{ ...pool[3], priority: 1 }],
      candidatePool: pool,
      difficulty: adaptiveDifficulty(0.5),
      tokenFactory: tokenFactory(),
      seed: "run-q",
    });
    const content = parsePublicAdaptiveGameRound(round.publicJson);
    expect(content.kind).toBe("quiz");
    if (content.kind === "quiz") {
      expect(content.options.filter((option) => option === "nghĩa-04")).toHaveLength(1);
      expect(new Set(content.options).size).toBe(content.options.length);
    }
  });
});
