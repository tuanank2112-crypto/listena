import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import {
  LearnerIntentError,
  LearnerIntentSchema,
  getLearnerIntent,
  updateLearnerIntent,
} from "@/server/learner-intent";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getLearnerIntent(session.user.id));
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    logger.error({ error, userId: session.user.id }, "Learner intent read failed");
    return NextResponse.json({ error: "Learner intent is unavailable", code: "INTENT_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const parsed = LearnerIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid learner intent", code: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json(await updateLearnerIntent(session.user.id, parsed.data));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_INPUT" }, { status: 400 });
    }
    if (error instanceof LearnerIntentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    logger.error({ error, userId: session.user.id }, "Learner intent update failed");
    return NextResponse.json({ error: "Learner intent is unavailable", code: "INTENT_UNAVAILABLE" }, { status: 503 });
  }
}
