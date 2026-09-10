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
