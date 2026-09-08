import {
  getDatasetUnit,
  getUnitLearningContext,
  searchKnowledge,
} from "@/server/dataset/catalog";
import type { MissionTemplate } from "@/server/ai/mission-templates";
import type { LearnerMemory } from "@/server/learner-memory/repository";

export type TutorSkill =
  "listening" | "vocabulary" | "spelling" | "grammar" | "communication";

export interface LearnerTutorContext {
  cefrLevel?: string;
  preferredTopics?: string[];
  skillMastery?: Partial<Record<TutorSkill, number>>;
  dueVocabulary?: string[];
  learnerMemory?: LearnerMemory;
}

export interface LessonTutorContext {
  title: string;
  unit?: number | null;
  topic?: string;
  learningObjectives?: string[];
  transcriptExcerpt?: string;
  targetVocabulary?: string[];
  targetGrammar?: string[];
}

export interface RecentTutorTurn {
  actor: "LEARNER" | "AI" | "COACH";
  content: string;
}

export interface GroundedKnowledgeSource {
  id: string;
  title: string;
  type: string;
  text: string;
}

export interface GroundedTutorContext {
  learner: {
    cefrLevel: string;
    preferredTopics: string[];
    weakestSkills: TutorSkill[];
    dueVocabulary: string[];
    memory?: BoundedLearnerMemory;
  };
  lesson: {
    title?: string;
    topic?: string;
    objectives: string[];
    transcriptExcerpt?: string;
    targetVocabulary: string[];
    targetGrammar: string[];
  };
  mission: {
    scenarioKey: string;
    learnerGoal: string;
    npcRole: string;
    targetVocabulary: string[];
    targetGrammar: string[];
  };
  verifiedKnowledge: GroundedKnowledgeSource[];
}

export interface BoundedLearnerMemory {
  goals: Array<{ text: string }>;
  recurringErrors: Array<{ errorType: string; count: number }>;
  provenSkills: Array<{
    skillKey: string;
    masteryScore: number;
    evidenceCount: number;
  }>;
  preferredTopics: string[];
}

export function buildGroundedTutorContext(input: {
  template: MissionTemplate;
  learnerGoal?: string;
  learnerMessage?: string;
  learnerContext?: LearnerTutorContext;
  lessonContext?: LessonTutorContext;
}): GroundedTutorContext {
  const { template, learnerContext, lessonContext } = input;
  const unit = resolveUnit(lessonContext, template.recommendedUnit);
  const query = [input.learnerMessage ?? ""].filter(Boolean).join(" ");
  const sources = searchKnowledge(query, unit, 8)
    .filter((item) => item.type !== "exercise")
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      text: sanitizeKnowledgeText(item.text),
    }))
    .filter((item) => item.text.length > 0);
  const unitContext = getUnitLearningContext(unit);

  return {
    learner: {
      cefrLevel: learnerContext?.cefrLevel ?? "A2",
      preferredTopics: cleanList(learnerContext?.preferredTopics, 5),
      weakestSkills: weakestSkills(learnerContext?.skillMastery),
      dueVocabulary: cleanList(learnerContext?.dueVocabulary, 8),
      memory: boundLearnerMemory(learnerContext?.learnerMemory),
    },
    lesson: {
      title: lessonContext?.title ?? unitContext?.title,
      topic: lessonContext?.topic,
      objectives: cleanList(
        lessonContext?.learningObjectives ?? unitContext?.objectives,
        5,
        240,
      ),
      transcriptExcerpt:
        cleanText(lessonContext?.transcriptExcerpt, 800) || undefined,
      targetVocabulary: cleanList(lessonContext?.targetVocabulary, 12),
      targetGrammar: cleanList(lessonContext?.targetGrammar, 6),
    },
    mission: {
      scenarioKey: template.key,
      learnerGoal: cleanText(input.learnerGoal, 240) || template.learnerGoal,
      npcRole: template.npcRole,
      targetVocabulary: template.targetVocabulary,
      targetGrammar: template.targetGrammar,
    },
    verifiedKnowledge: sources,
  };
}

export function sanitizeKnowledgeText(value: string) {
  return value
    .split(/(?:Đáp án|Answer key|Answers?)\s*:/i, 1)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function resolveUnit(
  lessonContext: LessonTutorContext | undefined,
  defaultUnit: number,
) {
  if (typeof lessonContext?.unit === "number") return lessonContext.unit;
  if (lessonContext?.title)
    return getDatasetUnit(lessonContext.title) ?? defaultUnit;
  return defaultUnit;
}

function weakestSkills(
  mastery: LearnerTutorContext["skillMastery"],
): TutorSkill[] {
  const skills: TutorSkill[] = [
    "listening",
    "vocabulary",
    "spelling",
    "grammar",
    "communication",
  ];
  return skills
    .map((skill) => ({ skill, score: mastery?.[skill] ?? 0.5 }))
    .sort(
      (left, right) =>
        left.score - right.score || left.skill.localeCompare(right.skill),
    )
    .slice(0, 2)
    .map(({ skill }) => skill);
}

function cleanList(
  values: string[] | undefined,
  limit: number,
  itemLimit = 80,
) {
  return (values ?? [])
    .map((value) => cleanText(value, itemLimit))
    .slice(0, limit);
}

function cleanText(value: string | undefined, limit: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, limit) ?? "";
}

function boundLearnerMemory(memory: LearnerMemory | undefined): BoundedLearnerMemory | undefined {
  if (!memory) return undefined;
  const topics = memory.preferences.topics;
  return {
    goals: memory.goals
      .map((goal) => ({ text: cleanText(goal.text, 240) }))
      .filter((goal) => Boolean(goal.text))
      .slice(0, 3),
    recurringErrors: memory.recurringErrors
      .map((error) => ({ errorType: cleanText(error.errorType, 80), count: error.count }))
      .filter((error) => Boolean(error.errorType))
      .slice(0, 4),
    provenSkills: memory.provenSkills
      .map((skill) => ({
        skillKey: cleanText(skill.skillKey, 80),
        masteryScore: skill.masteryScore,
        evidenceCount: skill.evidenceCount,
      }))
      .filter((skill) => Boolean(skill.skillKey))
      .slice(0, 6),
    preferredTopics: Array.isArray(topics)
      ? cleanList(topics, 5)
      : [],
  };
}
