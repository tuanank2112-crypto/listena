import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { planNextLearningAction } from "@/server/learning/planner";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    return NextResponse.json({ decision: await planNextLearningAction(session.user.id) });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    logger.error({ error, userId: session.user.id }, "Learning decision unavailable");
    return NextResponse.json({ error: "Learning decision is unavailable", code: "DECISION_UNAVAILABLE" }, { status: 503 });
  }
}
