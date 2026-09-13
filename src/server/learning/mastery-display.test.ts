import { describe, expect, it } from "vitest";
import {
  resolveDisplayMastery,
  resolveDisplaySkillObservation,
  resolveSkillObservation,
} from "./mastery-display";

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

describe("resolveSkillObservation", () => {
  it("does not present a zero-evidence prior as a measured score", () => {
    expect(resolveSkillObservation({
      skillKey: "listening",
      masteryScore: 0.5,
      evidenceCount: 0,
      calibrationStatus: "CALIBRATED",
    })).toEqual({
      skillKey: "listening",
      score: null,
      evidenceCount: 0,
      status: "UNKNOWN",
    });
  });

  it("uses provisional and calibrated statuses only for valid observed scores", () => {
    expect(resolveSkillObservation({
      skillKey: "vocabulary",
      masteryScore: 0.64,
      evidenceCount: 2,
      calibrationStatus: "CALIBRATING",
    })).toMatchObject({ score: 0.64, evidenceCount: 2, status: "PROVISIONAL" });

    expect(resolveSkillObservation({
      skillKey: "vocabulary",
      masteryScore: 2,
      evidenceCount: 12,
      calibrationStatus: "CALIBRATED",
    })).toMatchObject({ score: 1, evidenceCount: 12, status: "CALIBRATED" });
  });

  it("treats malformed evidence counts and scores as unknown", () => {
    expect(resolveSkillObservation({
      skillKey: "spelling",
      masteryScore: Number.NaN,
      evidenceCount: 3,
      calibrationStatus: "CALIBRATED",
    })).toMatchObject({ score: null, evidenceCount: 3, status: "UNKNOWN" });

    expect(resolveSkillObservation({
      skillKey: "spelling",
      masteryScore: 0.8,
      evidenceCount: 1.5,
      calibrationStatus: "CALIBRATED",
    })).toMatchObject({ score: null, evidenceCount: 0, status: "UNKNOWN" });
  });

  it("keeps a profile-only prior unknown until the skill has its own evidence", () => {
    expect(resolveDisplaySkillObservation(
      "listening",
      [],
      { listeningMastery: 0.5, calibrationStatus: "CALIBRATED" },
    )).toMatchObject({ score: null, evidenceCount: 0, status: "UNKNOWN" });

    expect(resolveDisplaySkillObservation(
      "listening",
      [{ skillKey: "listening", masteryScore: 0.73, evidenceCount: 4 }],
      { listeningMastery: 0.5, calibrationStatus: "CALIBRATED" },
    )).toMatchObject({ score: 0.73, evidenceCount: 4, status: "CALIBRATED" });
  });
});
