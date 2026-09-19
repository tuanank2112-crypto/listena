import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { getLearnerMemory } from "@/server/learner-memory/repository";
import { buildMistakeHistory } from "@/server/learning/mistakes";

/** Plan21 SPEC-P213 §3. Read caps, so a long history cannot page the server to death. */
const AI_TURN_QUERY_LIMIT = 120;
const MAX_FAMILIES = 6;
const MAX_EXAMPLES_PER_FAMILY = 3;

/**
 * Plan21 SPEC-P213 — the mistakes this learner keeps making, in Vietnamese,
 * with the sentences they actually wrote.
 *
 * Read-only and owner-scoped. Counts come from the same learner memory the
 * planner reads, so this page and the suggested next step can never disagree.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [memory, aiTurns] = await Promise.all([
      getLearnerMemory(userId),
      prisma.learningTurn.findMany({
        where: { actor: "AI", session: { userId } },
        select: {
          contentJson: true,
          createdAt: true,
          session: { select: { goal: true } },
        },
        orderBy: { createdAt: "desc" },
        take: AI_TURN_QUERY_LIMIT,
      }),
    ]);

    const families = buildMistakeHistory({
      recurringErrors: memory?.recurringErrors ?? [],
      aiTurns,
      maxFamilies: MAX_FAMILIES,
      maxExamplesPerFamily: MAX_EXAMPLES_PER_FAMILY,
    });

    return NextResponse.json({
      families,
      correctedTurnCount: families.reduce((total, family) => total + family.examples.length, 0),
    });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    logger.error({ error: message }, "Failed to fetch learner mistakes");
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
