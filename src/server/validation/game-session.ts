import { z } from "zod";

/**
 * Kept as an explicit tombstone so a future route cannot accidentally revive
 * the insecure batch contract. New game input lives in
 * `server/adaptive-games/contracts.ts` and never accepts a client score.
 */
export const RetiredGameSessionSchema = z.never();
export type RetiredGameSessionInput = z.infer<typeof RetiredGameSessionSchema>;
