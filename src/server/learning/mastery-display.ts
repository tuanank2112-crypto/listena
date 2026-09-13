export type DisplayMasterySkill = "listening" | "vocabulary" | "spelling";

type DisplaySkillMastery = {
  skillKey: string;
  masteryScore: unknown;
  evidenceCount?: unknown;
};

type DisplayMasteryProfile = {
  listeningMastery?: unknown;
  vocabularyMastery?: unknown;
  spellingMastery?: unknown;
  calibrationStatus?: unknown;
} | null | undefined;

export type SkillObservationStatus = "UNKNOWN" | "PROVISIONAL" | "CALIBRATED";

export type SkillObservation = {
  skillKey: string;
  score: number | null;
  evidenceCount: number;
  status: SkillObservationStatus;
};

export type ResolveSkillObservationInput = {
  skillKey: string;
  masteryScore: unknown;
  evidenceCount: unknown;
  calibrationStatus: unknown;
};

const profileFieldBySkill: Record<DisplayMasterySkill, "listeningMastery" | "vocabularyMastery" | "spellingMastery"> = {
  listening: "listeningMastery",
  vocabulary: "vocabularyMastery",
  spelling: "spellingMastery",
};

function normalizeMastery(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function normalizeEvidenceCount(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return 0;
  return value;
}

function isDisplayMasterySkill(skillKey: string): skillKey is DisplayMasterySkill {
  return skillKey in profileFieldBySkill;
}

/**
 * A persisted 0.5 prior is useful to adaptive internals, but it is not learner
 * evidence. Keep that distinction explicit at the UI boundary.
 */
export function resolveSkillObservation(input: ResolveSkillObservationInput): SkillObservation {
  const evidenceCount = normalizeEvidenceCount(input.evidenceCount);
  const score = normalizeMastery(input.masteryScore);

  if (evidenceCount === 0 || score === null) {
    return {
      skillKey: input.skillKey,
      score: null,
      evidenceCount,
      status: "UNKNOWN",
    };
  }

  return {
    skillKey: input.skillKey,
    score,
    evidenceCount,
    status: input.calibrationStatus === "CALIBRATED" ? "CALIBRATED" : "PROVISIONAL",
  };
}

/**
 * Resolves the dashboard's honest observation. A profile fallback has no
 * per-skill evidence count, so it remains UNKNOWN until server-owned evidence
 * exists for that skill.
 */
export function resolveDisplaySkillObservation(
  skillKey: string,
  skillMasteries: readonly DisplaySkillMastery[],
  profile: DisplayMasteryProfile,
): SkillObservation {
  const mastery = skillMasteries.find((item) => item.skillKey === skillKey);
  const profileScore = isDisplayMasterySkill(skillKey)
    ? profile?.[profileFieldBySkill[skillKey]]
    : undefined;

  return resolveSkillObservation({
    skillKey,
    masteryScore: mastery ? mastery.masteryScore : profileScore,
    evidenceCount: mastery?.evidenceCount,
    calibrationStatus: profile?.calibrationStatus,
  });
}

/**
 * Resolves public meter values from the adaptive record first. Profile columns
 * remain compatibility-only fallbacks for existing consumers. New learner UI
 * should use resolveDisplaySkillObservation so an unevidenced prior is not
 * presented as a measured ability.
 */
export function resolveDisplayMastery(
  skillKey: string,
  skillMasteries: readonly DisplaySkillMastery[],
  profile: DisplayMasteryProfile,
): number {
  if (!isDisplayMasterySkill(skillKey)) return 0.5;

  const mastery = skillMasteries.find((item) => item.skillKey === skillKey);
  if (mastery) {
    const normalizedMastery = normalizeMastery(mastery.masteryScore);
    if (normalizedMastery !== null) return normalizedMastery;
  }

  const normalizedProfile = normalizeMastery(profile?.[profileFieldBySkill[skillKey]]);
  return normalizedProfile ?? 0.5;
}
