import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { archiveLearnerMissionScenario } from "@/server/learning/mission-scenarios";

/**
 * Plan23 SPEC-P233 — remove one of the learner's own scenarios.
 *
 * Archived, not deleted: a session already played with it still names it, and
 * that name has to keep resolving.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ scenarioId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { scenarioId } = await context.params;
    // updateMany scoped to (id, userId) is the ownership check: somebody else's
    // scenario simply matches nothing, and answers exactly like a missing one.
    const archived = await archiveLearnerMissionScenario(session.user.id, scenarioId);
    if (!archived) return NextResponse.json({ error: "Không tìm thấy chủ đề" }, { status: 404 });

    return NextResponse.json({ archived: true });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    logger.error(
      { error: error instanceof Error ? error.message : "unknown" },
      "Failed to archive a mission scenario",
    );
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
