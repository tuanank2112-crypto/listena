import type { MissionState } from "@/server/validation/learning-session";
import type { LessonTutorContext } from "@/server/ai/tutor-grounding";

export type MissionScenarioKey = "lost-luggage" | "cafe-order" | "mystery-clue";
export const LESSON_COACH_SCENARIO_KEY = "lesson-coach";

export interface MissionTemplate {
  key: MissionScenarioKey | typeof LESSON_COACH_SCENARIO_KEY;
  title: string;
  npcName: string;
  npcRole: string;
  learnerGoal: string;
  openingLine: string;
  firstPrompt: string;
  targetVocabulary: string[];
  targetGrammar: string[];
  maxTurns: number;
  recommendedUnit: number;
}

export function createLessonCoachTemplate(
  lessonContext?: LessonTutorContext,
): MissionTemplate {
  const title = cleanText(lessonContext?.title, 100) || "Your English lesson";
  const topic = cleanText(lessonContext?.topic, 100) || title;
  const objective =
    cleanList(lessonContext?.learningObjectives, 1, 180)[0] ||
    `explain the main idea of ${topic}`;
  const vocabulary = cleanList(lessonContext?.targetVocabulary, 12);
  const grammar = cleanList(lessonContext?.targetGrammar, 6);
  const transcriptFocus = firstTranscriptSentence(
    lessonContext?.transcriptExcerpt,
  );
  const vocabularyPrompt = vocabulary[0]
    ? ` Try to use "${vocabulary[0]}" in your answer.`
    : "";
  const firstPrompt = transcriptFocus
    ? `The lesson says: "${transcriptFocus}" What do you understand from this line?${vocabularyPrompt}`
    : `What did you learn about ${topic}?${vocabularyPrompt}`;

  return {
    key: LESSON_COACH_SCENARIO_KEY,
    title: `Lesson Coach: ${title}`,
    npcName: "Listena Coach",
    npcRole: "Socratic English lesson coach",
    learnerGoal: `Explain and use the lesson content about ${topic}. Focus: ${objective}`,
    openingLine: `Let's work on "${title}" about ${topic}. Our focus is: ${objective}`,
    firstPrompt,
    targetVocabulary: vocabulary,
    targetGrammar: grammar,
    maxTurns: 7,
    recommendedUnit: lessonContext?.unit ?? 1,
  };
}

export const MISSION_TEMPLATES: Record<MissionScenarioKey, MissionTemplate> = {
  "lost-luggage": {
    key: "lost-luggage",
    title: "The Missing Suitcase",
    npcName: "Maya",
    npcRole: "airport service agent",
    learnerGoal:
      "Report a missing suitcase and give enough details to find it.",
    openingLine: "Hello. I can help with your missing luggage.",
    firstPrompt: "What does your suitcase look like?",
    targetVocabulary: ["suitcase", "lost", "colour", "size", "flight"],
    targetGrammar: ["past simple", "there is/there are"],
    maxTurns: 8,
    recommendedUnit: 3,
  },
  "cafe-order": {
    key: "cafe-order",
    title: "The Busy Cafe",
    npcName: "Sam",
    npcRole: "cafe server",
    learnerGoal: "Order a drink and snack, then solve one problem politely.",
    openingLine: "Welcome! It is busy, but I am ready.",
    firstPrompt: "What would you like to order?",
    targetVocabulary: ["menu", "order", "coffee", "sandwich", "bill"],
    targetGrammar: ["would like", "some/any"],
    maxTurns: 7,
    recommendedUnit: 1,
  },
  "mystery-clue": {
    key: "mystery-clue",
    title: "The Vanishing Trophy",
    npcName: "Alex",
    npcRole: "school detective",
    learnerGoal: "Ask about clues and decide where the missing trophy is.",
    openingLine: "The school trophy is gone. We have three clues.",
    firstPrompt: "Which clue do you want to examine first?",
    targetVocabulary: ["clue", "footprint", "empty", "strange", "suspect"],
    targetGrammar: ["past simple", "past continuous", "question forms"],
    maxTurns: 9,
    recommendedUnit: 3,
  },
};

export function isMissionScenarioKey(
  value: string | undefined,
): value is MissionScenarioKey {
  return typeof value === "string" && Object.hasOwn(MISSION_TEMPLATES, value);
}

export function getMissionTemplate(scenarioKey?: string): MissionTemplate {
  return isMissionScenarioKey(scenarioKey)
    ? MISSION_TEMPLATES[scenarioKey]
    : MISSION_TEMPLATES["lost-luggage"];
}

export function createMissionState(
  template: MissionTemplate,
  overrides: { goal?: string; targetVocabulary?: string[]; maxTurns?: number } = {},
): MissionState {
  return {
    phase: "ENCOUNTER",
    scenarioKey: template.key,
    scenarioTitle: template.title,
    npcName: template.npcName,
    npcRole: template.npcRole,
    learnerGoal: overrides.goal?.trim() || template.learnerGoal,
    targetVocabulary: uniqueWords([
      ...template.targetVocabulary,
      ...(overrides.targetVocabulary ?? []),
    ]).slice(0, 12),
    targetGrammar: template.targetGrammar.slice(0, 6),
    trust: 40,
    evidence: 0,
    turnCount: 0,
    successfulTurns: 0,
    recoveryCount: 0,
    maxTurns: validTurnBudget(overrides.maxTurns) ?? template.maxTurns,
  };
}

function validTurnBudget(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 3 && value <= 20
    ? value
    : undefined;
}

function uniqueWords(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function firstTranscriptSentence(value: string | undefined) {
  const transcript = cleanText(value, 500);
  if (!transcript) return "";
  const [firstSentence] = transcript.split(/(?<=[.!?])\s+/);
  return cleanText(firstSentence, 180);
}

function cleanList(
  values: string[] | undefined,
  limit: number,
  itemLimit = 80,
) {
  return (values ?? [])
    .map((value) => cleanText(value, itemLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanText(value: string | undefined, limit: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, limit) ?? "";
}
