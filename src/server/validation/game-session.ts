import { z } from "zod";

export const GameSessionSchema = z.object({
  mode: z.enum(["quiz", "match", "spell", "scramble", "cloze", "sprint"]),
  results: z
    .array(
      z.object({
        vocabularyItemId: z.string().uuid(),
        correct: z.boolean(),
        responseTimeMs: z.number().int().min(0).max(600000).optional(),
      })
    )
    .min(1)
    .max(100),
});

export type GameSessionInput = z.infer<typeof GameSessionSchema>;
