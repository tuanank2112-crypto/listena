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
    transcript: z.string().trim().min(20).max(2_000),
    vocabulary: z.array(LessonVocabularyDraftSchema).min(4).max(8),
    exercises: z.array(LessonExerciseDraftSchema).min(4).max(6),
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

// JSON Schema supplied to the provider. The OpenAI strict subset requires all
// declared object properties to be required and does not support cardinality/
// string-bound keywords consistently, so nullable fields are explicit here and
// Zod parsing above remains the final semantic/security boundary.
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
          "ipa",
          "meaningVi",
          "meaningEn",
          "partOfSpeech",
          "cefrLevel",
          "exampleSentence",
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
