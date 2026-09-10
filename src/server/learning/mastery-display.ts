export type DisplayMasterySkill = "listening" | "vocabulary" | "spelling";

type DisplaySkillMastery = {
  skillKey: string;
  masteryScore: unknown;
};

type DisplayMasteryProfile = {
  listeningMastery?: unknown;
  vocabularyMastery?: unknown;
  spellingMastery?: unknown;
} | null | undefined;

const profileFieldBySkill: Record<DisplayMasterySkill, keyof NonNullable<DisplayMasteryProfile>> = {
  listening: "listeningMastery",
  vocabulary: "vocabularyMastery",
  spelling: "spellingMastery",
};

function normalizeMastery(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function isDisplayMasterySkill(skillKey: string): skillKey is DisplayMasterySkill {
  return skillKey in profileFieldBySkill;
}

/**
 * Resolves public meter values from the adaptive record first. Profile columns
 * remain compatibility-only fallbacks for learners without that skill record.
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
