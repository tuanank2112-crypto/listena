import { z } from "zod";

export const SkillKeySchema = z.enum([
  "listening",
  "vocabulary",
  "spelling",
  "grammar",
  "communication",
]);

export type SkillKey = z.infer<typeof SkillKeySchema>;

export const PersonalizedLessonRequestSchema = z.object({
  targetSkill: SkillKeySchema.optional(),
});

/**
 * Plan13 SPEC-P131 §4: the compact lesson shape. Measured on 2026-09-17, a
 * 2,200-token generation hit the Vyce gateway 524 at ~125s every time while
 * ~1,200-token outputs returned in 7-10s. The draft is therefore bounded to
 * 4-5 vocabulary items, exactly 4 exercises, a transcript of at most 700
 * characters, and 1,400 output tokens. Raising any of these is forbidden by
 * the plan (vùng cấm) without a new measurement.
 */
export const PERSONALIZED_LESSON_VOCABULARY_MIN = 4;
export const PERSONALIZED_LESSON_VOCABULARY_MAX = 5;
export const PERSONALIZED_LESSON_EXERCISE_COUNT = 4;
export const PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS = 700;
export const PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS = 1_400;

const CefrLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

const LessonVocabularyDraftSchema = z.object({
  lemma: z.string().trim().min(1).max(80),
  displayText: z.string().trim().min(1).max(100),
  ipa: z.string().trim().max(100).nullable().optional(),
  meaningVi: z.string().trim().min(1).max(240),
  meaningEn: z.string().trim().max(240).nullable().optional(),
  partOfSpeech: z.string().trim().max(80).nullable().optional(),
  cefrLevel: CefrLevelSchema,
  exampleSentence: z.string().trim().max(400).nullable().optional(),
  isTarget: z.boolean().default(true),
  importance: z.number().min(0.1).max(2).default(1),
});

const ExerciseTypeSchema = z.enum(["CHOICE", "SPELL", "FILL"]);

const LessonExercisePublicSchema = z.object({
  id: z.string().trim().regex(/^exercise-[1-6]$/),
  type: ExerciseTypeSchema,
  prompt: z.string().trim().min(3).max(500),
  options: z.array(z.string().trim().min(1).max(180)).min(2).max(6).nullable().optional(),
});

const LessonExerciseDraftSchema = LessonExercisePublicSchema.extend({
  answer: z.union([
    z.string().trim().min(1).max(500),
    z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  ]),
  feedbackVi: z.string().trim().min(3).max(500),
})
  .superRefine((exercise, context) => {
    if (exercise.type === "CHOICE" && !exercise.options) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "CHOICE exercises require options",
      });
    }
    if (exercise.type !== "CHOICE" && exercise.options) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only CHOICE exercises may include options",
      });
    }
    if (exercise.type === "CHOICE" && exercise.options) {
      const answers = Array.isArray(exercise.answer)
        ? exercise.answer
        : [exercise.answer];
      const optionSet = new Set(exercise.options.map(normalizeAnswer));
      if (answers.some((answer) => !optionSet.has(normalizeAnswer(answer)))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: "A CHOICE answer must be one of its options",
        });
      }
    }
  });

export const PersonalizedLessonDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    targetSkill: SkillKeySchema,
    cefrLevel: CefrLevelSchema,
    difficulty: z.number().min(0.6).max(1.8),
    objectives: z.array(z.string().trim().min(3).max(240)).min(2).max(4),
    introVi: z.string().trim().min(3).max(500),
    transcript: z.string().trim().min(20).max(PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS),
    vocabulary: z
      .array(LessonVocabularyDraftSchema)
      .min(PERSONALIZED_LESSON_VOCABULARY_MIN)
      .max(PERSONALIZED_LESSON_VOCABULARY_MAX),
    exercises: z
      .array(LessonExerciseDraftSchema)
      .min(PERSONALIZED_LESSON_EXERCISE_COUNT)
      .max(PERSONALIZED_LESSON_EXERCISE_COUNT),
  })
  .superRefine((draft, context) => {
    const ids = new Set(draft.exercises.map((exercise) => exercise.id));
    if (ids.size !== draft.exercises.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exercises"],
        message: "Exercise IDs must be unique",
      });
    }
    const lemmas = new Set(draft.vocabulary.map((item) => normalizeLemma(item.lemma)));
    if (lemmas.size !== draft.vocabulary.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vocabulary"],
        message: "Vocabulary lemmas must be unique",
      });
    }
    if (draft.vocabulary.some((item) => !normalizeLemma(item.lemma))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vocabulary"],
        message: "Vocabulary lemmas must contain normalized English text",
      });
    }
    for (const [index, exercise] of draft.exercises.entries()) {
      const answers = Array.isArray(exercise.answer)
        ? exercise.answer
        : [exercise.answer];
      if (answers.some((answer) => !normalizeAnswer(answer))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exercises", index, "answer"],
          message: "Exercise answers must contain normalized English text",
        });
      }
    }
  });

export type PersonalizedLessonDraft = z.infer<typeof PersonalizedLessonDraftSchema>;

export const PersonalizedLessonContentSchema = z.object({
  introVi: z.string(),
  transcript: z.string(),
  vocabulary: z.array(
    LessonVocabularyDraftSchema.omit({ isTarget: true, importance: true }).extend({
      id: z.string().uuid(),
      isTarget: z.boolean(),
      importance: z.number(),
    }),
  ),
  exercises: z.array(LessonExercisePublicSchema),
});

export const PersonalizedLessonValidatorSchema = z.object({
  exercises: z.array(
    z.object({
      id: z.string(),
      acceptedAnswers: z.array(z.string().min(1)).min(1).max(8),
      feedbackVi: z.string().min(1).max(500),
    }),
  ),
});

export type PersonalizedLessonContent = z.infer<
  typeof PersonalizedLessonContentSchema
>;
export type PersonalizedLessonValidator = z.infer<
  typeof PersonalizedLessonValidatorSchema
>;

export const PersonalizedLessonAttemptInputSchema = z.object({
  exerciseId: z.string().trim().regex(/^exercise-[1-6]$/),
  answer: z.string().trim().min(1).max(2_000),
  clientAttemptId: z.string().trim().min(8).max(120),
  responseTimeMs: z.number().int().min(0).max(30 * 60 * 1_000).optional(),
  // Plan13 P133 Answer Canvas: assist cost paid, confidence bet and mode.
  hintCount: z.number().int().min(0).max(20).default(0),
  confidence: z.number().int().min(1).max(3).optional(),
  assistMode: z.enum(["FREE", "SKELETON", "TILES"]).optional(),
});

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLemma(value: string): string {
  return normalizeAnswer(value).slice(0, 80);
}

export function toStoredPersonalizedLesson(draft: PersonalizedLessonDraft, vocabularyIds: string[]): {
  content: PersonalizedLessonContent;
  validator: PersonalizedLessonValidator;
} {
  if (draft.vocabulary.length !== vocabularyIds.length) {
    throw new Error("Personalized vocabulary persistence mismatch");
  }

  return {
    content: PersonalizedLessonContentSchema.parse({
      introVi: draft.introVi,
      transcript: draft.transcript,
      vocabulary: draft.vocabulary.map((item, index) => ({
        id: vocabularyIds[index],
        lemma: normalizeLemma(item.lemma),
        displayText: item.displayText,
        ...(item.ipa ? { ipa: item.ipa } : {}),
        meaningVi: item.meaningVi,
        ...(item.meaningEn ? { meaningEn: item.meaningEn } : {}),
        ...(item.partOfSpeech ? { partOfSpeech: item.partOfSpeech } : {}),
        cefrLevel: item.cefrLevel,
        ...(item.exampleSentence ? { exampleSentence: item.exampleSentence } : {}),
        isTarget: item.isTarget,
        importance: item.importance,
      })),
      exercises: draft.exercises.map(({ answer: _answer, feedbackVi: _feedbackVi, options, ...exercise }) => ({
        ...exercise,
        ...(options ? { options } : {}),
      })),
    }),
    validator: PersonalizedLessonValidatorSchema.parse({
      exercises: draft.exercises.map((exercise) => ({
        id: exercise.id,
        acceptedAnswers: (Array.isArray(exercise.answer)
          ? exercise.answer
          : [exercise.answer]
        ).map(normalizeAnswer),
        feedbackVi: exercise.feedbackVi,
      })),
    }),
  };
}

// JSON Schema supplied to the provider. Cardinality/string-bound keywords are
// not honoured consistently by the gateway, so the compact limits are stated
// in the prompt and enforced by the Zod draft schema above. Optional
// vocabulary fields (ipa/meaningEn/partOfSpeech/exampleSentence) are NOT in
// `required` (Plan13): every extra field costs output tokens against the
// gateway timeout; Zod still accepts them when present.
export const PERSONALIZED_LESSON_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "targetSkill",
    "cefrLevel",
    "difficulty",
    "objectives",
    "introVi",
    "transcript",
    "vocabulary",
    "exercises",
  ],
  properties: {
    title: { type: "string" },
    targetSkill: {
      type: "string",
      enum: ["listening", "vocabulary", "spelling", "grammar", "communication"],
    },
    cefrLevel: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
    difficulty: { type: "number" },
    objectives: {
      type: "array",
      items: { type: "string" },
    },
    introVi: { type: "string" },
    transcript: { type: "string" },
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "lemma",
          "displayText",
          "meaningVi",
          "cefrLevel",
          "isTarget",
          "importance",
        ],
        properties: {
          lemma: { type: "string" },
          displayText: { type: "string" },
          ipa: { anyOf: [{ type: "string" }, { type: "null" }] },
          meaningVi: { type: "string" },
          meaningEn: { anyOf: [{ type: "string" }, { type: "null" }] },
          partOfSpeech: { anyOf: [{ type: "string" }, { type: "null" }] },
          cefrLevel: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
          exampleSentence: { anyOf: [{ type: "string" }, { type: "null" }] },
          isTarget: { type: "boolean" },
          importance: { type: "number" },
        },
      },
    },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "prompt", "options", "answer", "feedbackVi"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["CHOICE", "SPELL", "FILL"] },
          prompt: { type: "string" },
          options: {
            anyOf: [
              { type: "null" },
              { type: "array", items: { type: "string" } },
            ],
          },
          answer: {
            anyOf: [
              { type: "string" },
              {
                type: "array",
                items: { type: "string" },
              },
            ],
          },
          feedbackVi: { type: "string" },
        },
      },
    },
  },
} as const;


/**
 * Plan13 follow-up: lenient, deterministic normalization of the raw provider
 * draft *before* Zod. The compact limits are stated in the prompt, but a
 * model that overshoots (5 exercises, 6 words, an 800-char transcript, ids
 * like "ex1") should not cost the learner a generation. Only shape is
 * repaired here; answers/feedback are never invented, and Zod remains the
 * authority afterwards.
 */
export function normalizePersonalizedLessonDraft(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const draft = { ...(raw as Record<string, unknown>) };

  if (typeof draft.transcript === "string") {
    draft.transcript = trimTranscript(draft.transcript, PERSONALIZED_LESSON_TRANSCRIPT_MAX_CHARS);
  }
  if (Array.isArray(draft.vocabulary)) {
    draft.vocabulary = draft.vocabulary
      .slice(0, PERSONALIZED_LESSON_VOCABULARY_MAX)
      .map((item) => normalizeVocabularyItem(item));
  }
  if (Array.isArray(draft.exercises)) {
    draft.exercises = draft.exercises
      .slice(0, PERSONALIZED_LESSON_EXERCISE_COUNT)
      .map((item, index) => normalizeExercise(item, index));
  }
  return draft;
}

function normalizeVocabularyItem(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const word = { ...(item as Record<string, unknown>) };
  for (const key of ["ipa", "meaningEn", "partOfSpeech", "exampleSentence"] as const) {
    const value = word[key];
    word[key] = typeof value === "string" && value.trim() ? value : null;
  }
  if (typeof word.isTarget !== "boolean") word.isTarget = true;
  const importance = Number(word.importance);
  word.importance = Number.isFinite(importance) && importance > 0
    ? Math.min(2, Math.max(0.1, importance))
    : 1;
  return word;
}

function normalizeExercise(item: unknown, index: number) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const exercise = { ...(item as Record<string, unknown>) };
  const expectedId = `exercise-${index + 1}`;
  if (exercise.id !== expectedId) exercise.id = expectedId;
  if (typeof exercise.type === "string") exercise.type = exercise.type.trim().toUpperCase();
  if (exercise.type !== "CHOICE") {
    delete exercise.options;
  } else if (Array.isArray(exercise.options)) {
    exercise.options = exercise.options.filter(
      (option): option is string => typeof option === "string" && Boolean(option.trim()),
    );
  }
  if (Array.isArray(exercise.answer)) {
    exercise.answer = exercise.answer.filter(
      (answer): answer is string => typeof answer === "string" && Boolean(answer.trim()),
    );
  }
  return exercise;
}

/** Cuts at the last sentence boundary (. ! ?) that fits; falls back to a word boundary. */
export function trimTranscript(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const window = trimmed.slice(0, maxChars);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(maxChars / 3)) return window.slice(0, sentenceEnd + 1).trim();
  const lastPunctuation = Math.max(window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?"));
  if (lastPunctuation >= Math.floor(maxChars / 3)) return window.slice(0, lastPunctuation + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return (wordEnd > 0 ? window.slice(0, wordEnd) : window).trim();
}

/**
 * Machine summary of Zod issues for logs: paths and codes only, never values
 * (learner content and answers must not reach the log). Example:
 * "zod:exercises.2.answer:too_small;transcript:too_big".
 */
export function summarizeZodIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; code: string }>,
  limit = 8,
) {
  const parts = issues
    .slice(0, limit)
    .map((issue) => `${issue.path.map(String).join(".") || "<root>"}:${issue.code}`);
  return `zod:${parts.join(";")}${issues.length > limit ? ";..." : ""}`;
}
