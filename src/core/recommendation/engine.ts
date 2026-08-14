/**
 * Recommendation engine: rule-based scoring for lesson suggestions.
 * Pure deterministic functions.
 */

import {
  REC_LEVEL_MATCH,
  REC_WEAKNESS_MATCH,
  REC_VOCAB_NEED,
  REC_TOPIC_PREFERENCE,
  REC_NOVELTY,
  REC_TEACHER_PRIORITY,
} from "../constants";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface LearnerContext {
  estimatedCefrLevel: CefrLevel;
  listeningMastery: number;
  vocabularyMastery: number;
  spellingMastery: number;
  preferredTopics: string[];
  weakSkills: string[];
  vocabularyDueCount: number;
}

export interface LessonCandidate {
  id: string;
  title: string;
  cefrLevel: CefrLevel;
  topic: string;
  difficulty: number;
  completed: boolean;
  score: number; // last attempt score if completed
  teacherPriority: number;
  isNew: boolean; // not yet started
}

export interface RecommendationResult {
  lessonId: string;
  score: number;
  reasons: string[];
  breakdown: {
    levelMatch: number;
    weaknessMatch: number;
    vocabularyNeed: number;
    topicPreference: number;
    novelty: number;
    teacherPriority: number;
  };
}

const CEFR_ORDER: Record<CefrLevel, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
};

function cefrDistance(a: CefrLevel, b: CefrLevel): number {
  return Math.abs(CEFR_ORDER[a] - CEFR_ORDER[b]);
}

/**
 * Score a single lesson for recommendation.
 *
 * recommendationScore =
 *   levelMatch * 0.25 +
 *   weaknessMatch * 0.30 +
 *   vocabularyNeed * 0.20 +
 *   topicPreference * 0.10 +
 *   novelty * 0.10 +
 *   teacherPriority * 0.05
 */
export function scoreLesson(
  lesson: LessonCandidate,
  context: LearnerContext
): RecommendationResult {
  const reasons: string[] = [];

  // 1. Level match (0-1)
  const dist = cefrDistance(lesson.cefrLevel, context.estimatedCefrLevel);
  const levelMatch = dist === 0 ? 1 : dist === 1 ? 0.7 : dist === 2 ? 0.3 : 0;
  if (levelMatch >= 0.7) {
    reasons.push(`Bài phù hợp với trình độ ${context.estimatedCefrLevel} hiện tại.`);
  }

  // 2. Weakness match (0-1)
  let weaknessMatch = 0;
  if (context.weakSkills.length > 0) {
    // Simple heuristic: if lesson topic suggests weakness targeting
    weaknessMatch = 0.5;
  }
  if (lesson.completed && lesson.score < 60) {
    weaknessMatch = 1;
    reasons.push(`Bạn cần cải thiện kỹ năng ở bài này.`);
  }

  // 3. Vocabulary need (0-1)
  const vocabularyNeed = Math.min(context.vocabularyDueCount / 10, 1);
  if (context.vocabularyDueCount > 5) {
    reasons.push(`Bạn đang có ${context.vocabularyDueCount} từ cần ôn tập.`);
  }

  // 4. Topic preference (0-1)
  const topicPreference = context.preferredTopics.some(
    (t) => lesson.topic.toLowerCase().includes(t.toLowerCase())
  )
    ? 1
    : 0.3;
  if (topicPreference >= 1) {
    reasons.push(`Chủ đề "${lesson.topic}" phù hợp với sở thích của bạn.`);
  }

  // 5. Novelty (0-1)
  const novelty = lesson.isNew ? 1 : lesson.completed ? 0.2 : 0.5;
  if (lesson.isNew) {
    reasons.push(`Bài học mới giúp bạn mở rộng kiến thức.`);
  } else if (novelty < 0.5) {
    reasons.push(`Ôn lại bài cũ giúp củng cố kiến thức.`);
  }

  // 6. Teacher priority (0-1)
  const teacherPriority = Math.min(lesson.teacherPriority, 1);

  // Calculate total score
  const score =
    levelMatch * REC_LEVEL_MATCH +
    weaknessMatch * REC_WEAKNESS_MATCH +
    vocabularyNeed * REC_VOCAB_NEED +
    topicPreference * REC_TOPIC_PREFERENCE +
    novelty * REC_NOVELTY +
    teacherPriority * REC_TEACHER_PRIORITY;

  return {
    lessonId: lesson.id,
    score: Math.round(score * 1000) / 1000,
    reasons,
    breakdown: {
      levelMatch: Math.round(levelMatch * 1000) / 1000,
      weaknessMatch: Math.round(weaknessMatch * 1000) / 1000,
      vocabularyNeed: Math.round(vocabularyNeed * 1000) / 1000,
      topicPreference: Math.round(topicPreference * 1000) / 1000,
      novelty: Math.round(novelty * 1000) / 1000,
      teacherPriority: Math.round(teacherPriority * 1000) / 1000,
    },
  };
}

/**
 * Rank lessons by recommendation score, return top N.
 */
export function rankRecommendations(
  lessons: LessonCandidate[],
  context: LearnerContext,
  topN: number = 5
): RecommendationResult[] {
  const scored = lessons.map((lesson) => scoreLesson(lesson, context));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
