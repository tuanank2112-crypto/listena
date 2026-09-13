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
  /** A planner CTA may pin an already-selected authored scenario. */
  scenarioKey?: MissionScenarioKey;
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

/** Deliberately small authored vocabulary; preferences rank authored scenes, never invent one. */
export const MISSION_SCENARIO_TOPICS: Record<MissionScenarioKey, string[]> = {
  "cafe-order": ["food", "restaurant", "daily life", "travel"],
  "lost-luggage": ["travel", "airport", "emergency"],
  "mystery-clue": ["school", "mystery", "story"],
};

export function planDailyQuest(input: DailyQuestPlanInput): DailyQuestPlan {
  const focusSkill = [...SKILLS].sort((left, right) => {
    const scoreDelta = mastery(input, left) - mastery(input, right);
    return scoreDelta || left.localeCompare(right);
  })[0];
  const candidates = SKILL_SCENARIOS[focusSkill];
  const scenarioKey = input.scenarioKey ?? selectDailyQuestScenario({
    candidates,
    preferredTopics: input.preferredTopics,
    recentScenarioKeys: input.recentScenarioKeys,
    seed: `${input.learnerKey}:${input.dateKey}`,
  });
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

export function selectDailyQuestScenario(input: {
  candidates?: readonly MissionScenarioKey[];
  preferredTopics?: string[];
  recentScenarioKeys?: string[];
  seed: string;
}): MissionScenarioKey {
  return selectDailyQuestScenarioDetail(input).scenarioKey;
}

/**
 * Topic relevance is ranked before novelty. Within the selected topic group,
 * an unseen scene wins; when all candidates in that group were seen, choose
 * the least-recent one before using the stable seed as a tie breaker.
 */
export function selectDailyQuestScenarioDetail(input: {
  candidates?: readonly MissionScenarioKey[];
  preferredTopics?: string[];
  recentScenarioKeys?: string[];
  seed: string;
}): { scenarioKey: MissionScenarioKey; preferenceInfluenced: boolean } {
  const requestedCandidates = uniqueScenarioKeys(
    input.candidates ?? Object.keys(MISSION_TEMPLATES) as MissionScenarioKey[],
  );
  const candidates = requestedCandidates.length
    ? requestedCandidates
    : Object.keys(MISSION_TEMPLATES) as MissionScenarioKey[];
  const topics = new Set(
    (input.preferredTopics ?? [])
      .map((topic) => topic.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const topicMatched = topics.size
    ? candidates.filter((key) => MISSION_SCENARIO_TOPICS[key].some((topic) => topics.has(topic)))
    : [];
  // A matching topic only counts as an influence when it ruled out at least
  // one authored alternative; do not claim personalization when all options
  // happen to match or there was no alternative to rank.
  const preferenceInfluenced = topicMatched.length > 0 && topicMatched.length < candidates.length;
  const topicalPool = topicMatched.length ? topicMatched : candidates;
  const recentIndexes = recentIndexesFor(input.recentScenarioKeys ?? []);
  const unseen = topicalPool.filter((key) => !recentIndexes.has(key));
  const pool = unseen.length ? unseen : leastRecent(topicalPool, recentIndexes);

  return {
    scenarioKey: pool[stableIndex(input.seed, pool.length)]!,
    preferenceInfluenced,
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

function uniqueScenarioKeys(values: readonly MissionScenarioKey[]) {
  return [...new Set(values)];
}

function recentIndexesFor(values: readonly string[]) {
  const indexes = new Map<string, number>();
  values.forEach((value, index) => {
    if (!indexes.has(value)) indexes.set(value, index);
  });
  return indexes;
}

function leastRecent(
  candidates: readonly MissionScenarioKey[],
  recentIndexes: ReadonlyMap<string, number>,
) {
  const oldestIndex = Math.max(...candidates.map((key) => recentIndexes.get(key) ?? -1));
  return candidates.filter((key) => recentIndexes.get(key) === oldestIndex);
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
