import { z } from "zod";
import { normalizeText } from "@/core/text/normalize";

export const AdaptiveGameModeSchema = z.enum(["QUIZ", "MATCH", "SPELL"]);
export type AdaptiveGameModeInput = z.infer<typeof AdaptiveGameModeSchema>;

export const CreateAdaptiveGameRunSchema = z
  .object({ mode: AdaptiveGameModeSchema })
  .strict();
export type CreateAdaptiveGameRunInput = z.infer<typeof CreateAdaptiveGameRunSchema>;

const NonEmptyAnswerSchema = z.string().trim().min(1).max(240);

export const SubmitAdaptiveGameAnswerSchema = z
  .object({
    roundId: z.string().uuid(),
    answer: z.union([
      NonEmptyAnswerSchema,
      z.array(NonEmptyAnswerSchema).length(2),
    ]),
    clientAnswerId: z.string().uuid(),
    responseTimeMs: z.number().int().min(0).max(600_000).optional(),
  })
  .strict();
export type SubmitAdaptiveGameAnswerInput = z.infer<typeof SubmitAdaptiveGameAnswerSchema>;

/**
 * This is the only JSON shape returned to a browser. In particular, it has no
 * normalized answer, answer-pair mapping, validator, vocabulary database id,
 * or provider provenance.
 */
export const PublicAdaptiveGameRoundSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("quiz"),
      prompt: z.literal("Chọn nghĩa đúng"),
      word: z.string().min(1).max(180),
      ipa: z.string().max(120).nullable(),
      options: z.array(z.string().min(1).max(240)).min(3).max(5),
      context: z.string().max(240).optional(),
      difficulty: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("match"),
      prompt: z.literal("Ghép từ với nghĩa"),
      cards: z
        .array(
          z
            .object({
              token: z.string().uuid(),
              kind: z.enum(["word", "meaning"]),
              label: z.string().min(1).max(240),
            })
            .strict(),
        )
        .min(3)
        .max(5),
      difficulty: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spell"),
      prompt: z.literal("Nghe và viết từ"),
      meaning: z.string().min(1).max(240),
      audioUrl: z.string().url().max(2048).nullable(),
      difficulty: z.number().min(0).max(1),
    })
    .strict(),
]);
export type PublicAdaptiveGameRoundPayload = z.infer<typeof PublicAdaptiveGameRoundSchema>;

const AnswerValidatorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("quiz"),
      normalizedExpectedAnswer: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal("match"),
      expectedTokens: z.tuple([z.string().uuid(), z.string().uuid()]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spell"),
      normalizedExpectedAnswer: z.string().min(1).max(240),
    })
    .strict(),
]);
export type AdaptiveGameAnswerValidator = z.infer<typeof AnswerValidatorSchema>;

export interface PublicAdaptiveGameRound {
  id: string;
  position: number;
  content: PublicAdaptiveGameRoundPayload;
}

export interface PublicAdaptiveGameRun {
  id: string;
  mode: AdaptiveGameModeInput;
  targetSkill: string;
  difficulty: number;
  expiresAt: string;
  rounds: PublicAdaptiveGameRound[];
}

export interface PublicAdaptiveGameAnswerResult {
  correct: boolean;
  score: number;
  feedbackVi: string;
  idempotent: boolean;
  nextRound?: PublicAdaptiveGameRound;
}

export function parsePublicAdaptiveGameRound(value: string): PublicAdaptiveGameRoundPayload {
  return PublicAdaptiveGameRoundSchema.parse(JSON.parse(value));
}

export function parseAdaptiveGameAnswerValidator(value: string): AdaptiveGameAnswerValidator {
  return AnswerValidatorSchema.parse(JSON.parse(value));
}

export function serializeRound(
  content: PublicAdaptiveGameRoundPayload,
  validator: AdaptiveGameAnswerValidator,
) {
  return {
    publicJson: JSON.stringify(content),
    validatorJson: JSON.stringify(validator),
  };
}

export function gradeAdaptiveGameAnswer(
  validator: AdaptiveGameAnswerValidator,
  answer: SubmitAdaptiveGameAnswerInput["answer"],
) {
  if (validator.kind === "match") {
    if (!Array.isArray(answer) || answer.length !== 2) return false;
    const submitted = answer.map((value) => value.trim()).sort();
    const expected = [...validator.expectedTokens].sort();
    return submitted[0] === expected[0] && submitted[1] === expected[1];
  }

  if (Array.isArray(answer)) return false;
  return normalizeText(answer) === validator.normalizedExpectedAnswer;
}
