import {
  MISSION_TEMPLATES,
  type MissionScenarioKey,
} from "@/server/ai/mission-templates";

export type DailyQuestSkill =
  "listening" | "vocabulary" | "spelling" | "grammar" | "communication";

export interface DailyQuestPlanInput {
  learnerKey: string;
  dateKey: string;
  skillMastery?: Partial<Record<DailyQuestSkill, number>>;
  dueVocabulary?: string[];
  preferredTopics?: string[];
  recentScenarioKeys?: string[];
}

export interface DailyQuestPlan {
  scenarioKey: MissionScenarioKey;
  goal: string;
  focusSkill: DailyQuestSkill;
  targetVocabulary: string[];
  reasonVi: string;
}

const SKILLS: DailyQuestSkill[] = [
  "listening",
  "vocabulary",
  "spelling",
  "grammar",
  "communication",
];

const SKILL_SCENARIOS: Record<DailyQuestSkill, MissionScenarioKey[]> = {
  listening: ["mystery-clue", "lost-luggage", "cafe-order"],
  vocabulary: ["lost-luggage", "mystery-clue", "cafe-order"],
  spelling: ["lost-luggage", "cafe-order", "mystery-clue"],
  grammar: ["mystery-clue", "cafe-order", "lost-luggage"],
  communication: ["cafe-order", "lost-luggage", "mystery-clue"],
};

export function planDailyQuest(input: DailyQuestPlanInput): DailyQuestPlan {
  const focusSkill = [...SKILLS].sort((left, right) => {
    const scoreDelta = mastery(input, left) - mastery(input, right);
    return scoreDelta || left.localeCompare(right);
  })[0];
  const recent = new Set(input.recentScenarioKeys ?? []);
  const candidates = SKILL_SCENARIOS[focusSkill];
  const available = candidates.filter((key) => !recent.has(key));
  const pool = available.length ? available : candidates;
  const scenarioKey =
    pool[stableIndex(`${input.learnerKey}:${input.dateKey}`, pool.length)];
  const template = MISSION_TEMPLATES[scenarioKey];
  const dueVocabulary = unique(input.dueVocabulary ?? []).slice(0, 5);

  return {
    scenarioKey,
    goal: template.learnerGoal,
    focusSkill,
    targetVocabulary: unique([
      ...dueVocabulary,
      ...template.targetVocabulary,
    ]).slice(0, 8),
    reasonVi: dueVocabulary.length
      ? `Ôn ${dueVocabulary.length} từ đến hạn và củng cố kỹ năng ${focusSkill}.`
      : `Củng cố kỹ năng ${focusSkill} qua một nhiệm vụ giao tiếp ngắn.`,
  };
}

function mastery(input: DailyQuestPlanInput, skill: DailyQuestSkill) {
  const value = input.skillMastery?.[skill];
  return typeof value === "number" && Number.isFinite(value) ? value : 0.5;
}

function stableIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
