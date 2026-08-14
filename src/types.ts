/**
 * Shared types for the ListenAI system.
 */

import type { AssessmentResult } from "@/core/assessment/engine";

export interface DictationAssessmentResult extends AssessmentResult {}

export interface AIFeedbackError {
  errorType: "PHONOLOGICAL" | "SEGMENTATION" | "GRAMMAR" | "VOCABULARY" | "SPELLING" | "UNKNOWN";
  expected: string;
  actual: string | null;
  probableCauseVi: string;
  explanationVi: string;
  microExercise: {
    type: "RELISTEN" | "MINIMAL_PAIR" | "FILL_BLANK" | "REPEAT" | "FLASHCARD";
    instructionVi: string;
    items: string[];
  } | null;
  confidence: number;
}

export interface AIFeedbackResponse {
  summaryVi: string;
  errors: AIFeedbackError[];
  recommendedActions: string[];
}

export interface AILessonDraft {
  title: string;
  transcript: string;
  segments: Array<{
    position: number;
    text: string;
    difficulty: number;
  }>;
  vocabulary: Array<{
    lemma: string;
    displayText: string;
    ipa: string;
    meaningVi: string;
    meaningEn: string;
    partOfSpeech: string;
    cefrLevel: string;
    exampleSentence: string;
  }>;
  exercises: Array<{
    type: "GIST" | "PARTIAL_DICTATION" | "FULL_DICTATION" | "VOCABULARY";
    prompt: string;
    correctAnswer: string;
    difficulty: number;
    position: number;
  }>;
}

export interface LearningMetrics {
  listeningMastery: number;
  vocabularyMastery: number;
  spellingMastery: number;
  functionWordMastery: number;
  segmentationMastery: number;
  totalStudyMinutes: number;
  currentStreak: number;
  weeklyStudyTime: number;
  cardsDueToday: number;
  weakSkills: string[];
}

export interface DashboardData {
  greeting: string;
  continueLessonId: string | null;
  recommendedLesson: {
    id: string;
    title: string;
    reason: string;
  } | null;
  cardsDueToday: number;
  currentStreak: number;
  weeklyStudyTime: number;
  listeningMastery: number;
  vocabularyMastery: number;
  weakSkills: string[];
  recentAttempts: Array<{
    id: string;
    lessonTitle: string;
    score: number;
    createdAt: Date;
  }>;
}
