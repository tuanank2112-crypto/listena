import type { CefrLevel } from "@prisma/client";

export const CALIBRATION_MIN_EVIDENCE = 8;
export const CALIBRATION_FINAL_EVIDENCE = 12;
export const CALIBRATION_MIN_SKILLS = 2;
export const CALIBRATION_CONFIDENCE = 0.75;

const levels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export type CalibrationEvidence = {
  skillKey: string;
  score: number;
  confidence: number;
};

export function assessCalibration(input: {
  currentLevel: CefrLevel;
  existingStatus: "UNASSESSED" | "CALIBRATING" | "CALIBRATED";
  evidence: CalibrationEvidence[];
}): {
  status: "UNASSESSED" | "CALIBRATING" | "CALIBRATED";
  nextLevel: CefrLevel;
  qualifyingCount: number;
  qualifyingSkillCount: number;
  averageScore: number | null;
} {
  const qualifying = input.evidence.filter(
    (item) => item.confidence >= CALIBRATION_CONFIDENCE,
  );
  const skillCount = new Set(qualifying.map((item) => item.skillKey)).size;
  const averageScore = qualifying.length
    ? qualifying.reduce((total, item) => total + item.score, 0) / qualifying.length
    : null;
  const hasBreadth = skillCount >= CALIBRATION_MIN_SKILLS;

  if (
    !hasBreadth ||
    qualifying.length < CALIBRATION_MIN_EVIDENCE
  ) {
    return {
      status: input.existingStatus === "CALIBRATED" ? "CALIBRATED" : "UNASSESSED",
      nextLevel: input.currentLevel,
      qualifyingCount: qualifying.length,
      qualifyingSkillCount: skillCount,
      averageScore,
    };
  }

  if (qualifying.length < CALIBRATION_FINAL_EVIDENCE || averageScore === null) {
    return {
      status: "CALIBRATING",
      nextLevel: input.currentLevel,
      qualifyingCount: qualifying.length,
      qualifyingSkillCount: skillCount,
      averageScore,
    };
  }

  return {
    status: "CALIBRATED",
    nextLevel: shiftLevel(input.currentLevel, averageScore),
    qualifyingCount: qualifying.length,
    qualifyingSkillCount: skillCount,
    averageScore,
  };
}

export function difficultyFromMastery(mastery: number | undefined): number {
  const bounded = Math.max(0, Math.min(1, mastery ?? 0.5));
  return roundDifficulty(0.75 + bounded * 0.8);
}

function shiftLevel(currentLevel: CefrLevel, averageScore: number): CefrLevel {
  const index = levels.indexOf(currentLevel);
  if (averageScore >= 0.65) return levels[Math.min(levels.length - 1, index + 1)]!;
  if (averageScore <= 0.35) return levels[Math.max(0, index - 1)]!;
  return currentLevel;
}

function roundDifficulty(value: number): number {
  return Math.round(value * 100) / 100;
}
