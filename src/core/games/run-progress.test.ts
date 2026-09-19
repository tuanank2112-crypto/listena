import { describe, expect, it } from "vitest";
import { comboLabelVi, summariseRunProgress, type RoundOutcome } from "./run-progress";

const round = (position: number, correct: boolean | null, score: number | null = correct ? 1 : 0): RoundOutcome =>
  ({ position, correct, score });

describe("summariseRunProgress", () => {
  it("counts a streak of consecutive correct answers", () => {
    expect(summariseRunProgress([round(1, true), round(2, true), round(3, true)]))
      .toMatchObject({ streak: 3, bestStreak: 3, correct: 3, answered: 3 });
  });

  it("breaks the streak on a wrong answer but remembers the best one", () => {
    const progress = summariseRunProgress([
      round(1, true), round(2, true), round(3, true), round(4, false), round(5, true),
    ]);
    expect(progress).toMatchObject({ streak: 1, bestStreak: 3, correct: 4 });
  });

  it("reads rounds in position order, so a late answer cannot inflate the streak", () => {
    // The same three rounds, shuffled: round 2 was wrong, so the streak ending
    // at round 3 is 1 however the rows arrive.
    const shuffled = [round(3, true), round(1, true), round(2, false)];
    expect(summariseRunProgress(shuffled)).toMatchObject({ streak: 1, bestStreak: 1 });
  });

  it("skips rounds nobody has answered instead of counting them wrong", () => {
    // A game in progress has not broken anyone's combo yet.
    const progress = summariseRunProgress([
      round(1, true), round(2, true), round(3, null, null), round(4, null, null),
    ]);
    expect(progress).toMatchObject({ answered: 2, total: 4, streak: 2, bestStreak: 2 });
  });

  it("adds up the server's own round scores and reports whole points", () => {
    const progress = summariseRunProgress([
      round(1, true, 1.5), round(2, true, 2.4), round(3, false, 0),
    ]);
    expect(progress.totalScore).toBe(4);
  });

  it("treats a missing score as no points rather than failing", () => {
    expect(summariseRunProgress([round(1, true, null)]).totalScore).toBe(0);
  });

  it("is all zeros for a run nobody has played", () => {
    expect(summariseRunProgress([round(1, null, null), round(2, null, null)]))
      .toEqual({ answered: 0, total: 2, correct: 0, streak: 0, bestStreak: 0, totalScore: 0 });
  });

  it("handles an empty run", () => {
    expect(summariseRunProgress([]))
      .toEqual({ answered: 0, total: 0, correct: 0, streak: 0, bestStreak: 0, totalScore: 0 });
  });

  it("does not mutate what it was given", () => {
    const rounds = [round(2, true), round(1, false)];
    summariseRunProgress(rounds);
    expect(rounds.map((item) => item.position)).toEqual([2, 1]);
  });
});

describe("comboLabelVi", () => {
  it("says nothing for a single correct answer", () => {
    expect(comboLabelVi(0)).toBeNull();
    expect(comboLabelVi(1)).toBeNull();
  });

  it("names the streak from two in a row", () => {
    expect(comboLabelVi(2)).toBe("Combo x2!");
    expect(comboLabelVi(7)).toBe("Combo x7!");
  });
});
