import "server-only";

import logger from "@/lib/logger";
import { planNextLearningAction } from "@/server/learning/planner";
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
      // Dashboard and debrief intentionally consume the same read-only
      // policy. The completed session is already durable before this helper
      // runs, so a planner failure must never roll back its outcome.
      nextAction: await planNextLearningAction(userId),
    };
  } catch (error) {
    logger.warn({ error, sessionId: result.session.id, userId }, "Next action unavailable");
    return { ...result, nextAction: null };
  }
}
