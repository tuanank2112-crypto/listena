import "server-only";

import logger from "@/lib/logger";
import { computeNextAction } from "@/server/learning/next-action";
import type { PublicLearningSession } from "@/features/learning-session/types";

type SessionResult = { session: PublicLearningSession };

/** Adds a best-effort recommendation without making an already completed turn fail. */
export async function withCompletedNextAction<T extends SessionResult>(
  userId: string,
  result: T,
) {
  if (result.session.status !== "COMPLETED") {
    return { ...result, nextAction: null };
  }

  try {
    return {
      ...result,
      nextAction: await computeNextAction(userId, result.session.id),
    };
  } catch (error) {
    logger.warn({ error, sessionId: result.session.id, userId }, "Next action unavailable");
    return { ...result, nextAction: null };
  }
}
