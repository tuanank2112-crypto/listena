import { z } from "zod";

// ── AI Feedback Output Schema ────────────────────────

export const AIFeedbackErrorSchema = z.object({
  errorType: z.enum([
    "PHONOLOGICAL",
    "SEGMENTATION",
    "GRAMMAR",
    "VOCABULARY",
    "SPELLING",
    "UNKNOWN",
  ]),
  expected: z.string(),
  actual: z.string().nullable(),
  probableCauseVi: z.string(),
  explanationVi: z.string(),
  microExercise: z
    .object({
      type: z.enum(["RELISTEN", "MINIMAL_PAIR", "FILL_BLANK", "REPEAT", "FLASHCARD"]),
      instructionVi: z.string(),
      items: z.array(z.string()),
    })
    .nullable(),
  confidence: z.number().min(0).max(1),
});

export const AIFeedbackResponseSchema = z.object({
  summaryVi: z.string(),
  errors: z.array(AIFeedbackErrorSchema),
  recommendedActions: z.array(z.string()),
});

export type AIFeedbackResponse = z.infer<typeof AIFeedbackResponseSchema>;

// ── AI Lesson Draft Schema ───────────────────────────

export const AILessonDraftSegmentSchema = z.object({
  position: z.number().int().min(1),
  text: z.string().min(1),
  difficulty: z.number().min(0.5).max(2),
});

export const AILessonDraftVocabularySchema = z.object({
  lemma: z.string().min(1),
  displayText: z.string().min(1),
  ipa: z.string().optional(),
  meaningVi: z.string().min(1),
  meaningEn: z.string().optional(),
  partOfSpeech: z.string().optional(),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  exampleSentence: z.string().optional(),
});

export const AILessonDraftExerciseSchema = z.object({
  type: z.enum(["GIST", "PARTIAL_DICTATION", "FULL_DICTATION", "VOCABULARY"]),
  prompt: z.string().min(1),
  correctAnswer: z.string().min(1),
  difficulty: z.number().min(0.5).max(2),
  position: z.number().int().min(1),
});

export const AILessonDraftSchema = z.object({
  title: z.string().min(1),
  transcript: z.string().min(1),
  segments: z.array(AILessonDraftSegmentSchema).min(1),
  vocabulary: z.array(AILessonDraftVocabularySchema).min(1),
  exercises: z.array(AILessonDraftExerciseSchema).min(1),
});

export type AILessonDraft = z.infer<typeof AILessonDraftSchema>;

// ── Input Validation Schemas ─────────────────────────

export const SubmitAttemptSchema = z.object({
  exerciseId: z.string().uuid(),
  lessonId: z.string().uuid(),
  submittedAnswer: z.string().min(1).max(5000),
  completionTimeMs: z.number().int().positive().optional(),
  replayCount: z.number().int().min(0).default(0),
  hintCount: z.number().int().min(0).default(0),
  playbackRate: z.number().min(0.5).max(2).default(1.0),
});

export const ReviewFlashcardSchema = z.object({
  flashcardId: z.string().uuid(),
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  responseTimeMs: z.number().int().positive().optional(),
});

export const GenerateLessonSchema = z.object({
  topic: z.string().min(1),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  learningObjectives: z.array(z.string()).min(1).max(5),
  targetVocabulary: z.array(z.string()).optional(),
  targetGrammar: z.array(z.string()).optional(),
  audioDuration: z.number().int().min(30).max(600).optional(),
  accent: z.enum(["us", "uk"]).optional(),
  difficulty: z.number().min(0.5).max(2).optional(),
});

export const CreateLessonSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  topic: z.string().min(1),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  learningObjectives: z.array(z.string()).default([]),
  transcript: z.string().min(1),
  audioUrl: z.string().url().optional().nullable(),
  accent: z.enum(["us", "uk"]).default("us"),
  defaultPlaybackRate: z.number().min(0.5).max(2).default(1.0),
  estimatedMinutes: z.number().int().min(1).default(10),
  segments: z
    .array(
      z.object({
        position: z.number().int().min(1),
        text: z.string().min(1),
        difficulty: z.number().default(1.0),
      })
    )
    .min(1),
  vocabulary: z
    .array(
      z.object({
        lemma: z.string().min(1),
        displayText: z.string().min(1),
        ipa: z.string().optional(),
        meaningVi: z.string().min(1),
        meaningEn: z.string().optional(),
        partOfSpeech: z.string().optional(),
        cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
        exampleSentence: z.string().optional(),
        isTarget: z.boolean().default(true),
        importance: z.number().default(1.0),
      })
    )
    .min(1),
  exercises: z
    .array(
      z.object({
        type: z.enum(["GIST", "PARTIAL_DICTATION", "FULL_DICTATION", "VOCABULARY"]),
        prompt: z.string().min(1),
        correctAnswer: z.string().min(1),
        segmentPosition: z.number().int().optional(),
        difficulty: z.number().default(1.0),
        position: z.number().int().min(1),
      })
    )
    .min(1),
});

export const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(["LEARNER", "TEACHER"]).default("LEARNER"),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
