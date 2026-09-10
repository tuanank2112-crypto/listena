import { describe, expect, it } from "vitest";
import { resolveDisplayMastery } from "./mastery-display";

describe("resolveDisplayMastery", () => {
  it("prefers a matching adaptive mastery over a stale profile field", () => {
    expect(resolveDisplayMastery(
      "listening",
      [{ skillKey: "listening", masteryScore: 0.78 }],
      { listeningMastery: 0.5 },
    )).toBe(0.78);
  });

  it("uses the mapped profile field only when the skill has no mastery row", () => {
    expect(resolveDisplayMastery(
      "vocabulary",
      [{ skillKey: "listening", masteryScore: 0.9 }],
      { vocabularyMastery: 0.42 },
    )).toBe(0.42);
  });

  it("clamps finite persisted scores and falls back from invalid values", () => {
    expect(resolveDisplayMastery(
      "spelling",
      [{ skillKey: "spelling", masteryScore: 2 }],
      { spellingMastery: 0.4 },
    )).toBe(1);
    expect(resolveDisplayMastery(
      "spelling",
      [{ skillKey: "spelling", masteryScore: Number.NaN }],
      { spellingMastery: -1 },
    )).toBe(0);
    expect(resolveDisplayMastery(
      "spelling",
      [{ skillKey: "spelling", masteryScore: Number.POSITIVE_INFINITY }],
      { spellingMastery: "invalid" },
    )).toBe(0.5);
  });

  it("returns a stable default for unsupported skills", () => {
    expect(resolveDisplayMastery("communication", [], { listeningMastery: 1 })).toBe(0.5);
  });
});
