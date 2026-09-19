import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { isAIProviderError } from "@/server/ai/errors";
import {
  ScenarioLimitError,
  createLearnerMissionScenario,
  listLearnerMissionScenarios,
} from "@/server/learning/mission-scenarios";

export const runtime = "nodejs";
/** The AI writes a short situation; a gateway can be slow on a cold call. */
export const maxDuration = 120;

const CreateScenarioSchema = z.object({
  prompt: z.string().trim().min(6).max(240),
}).strict();

/**
 * Plan23 SPEC-P233 — the learner's own mission scenarios.
 *
 * GET lists theirs. POST asks the AI to write one from what they typed. Both
 * are owner-scoped; there is no route that reads or writes anybody else's.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ scenarios: await listLearnerMissionScenarios(session.user.id) });
  } catch (error) {
    return failure(error, "Failed to list mission scenarios");
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const parsed = CreateScenarioSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Hãy mô tả tình huống bạn muốn tập, khoảng một câu." },
        { status: 400 },
      );
    }

    const scenario = await createLearnerMissionScenario({
      userId: session.user.id,
      prompt: parsed.data.prompt,
    });
    return NextResponse.json({ scenario }, { status: 201 });
  } catch (error) {
    if (error instanceof ScenarioLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (isAIProviderError(error)) {
      // The learner asked for something reasonable and the provider could not
      // answer. Say so plainly rather than blaming their request.
      return NextResponse.json(
        { error: "Chưa tạo được chủ đề lúc này. Bạn thử lại sau ít phút nhé.", code: "AI_UNAVAILABLE" },
        { status: 503 },
      );
    }
    return failure(error, "Failed to create a mission scenario");
  }
}

function failure(error: unknown, message: string) {
  const databaseResponse = databaseErrorResponse(error);
  if (databaseResponse) return databaseResponse;

  logger.error({ error: error instanceof Error ? error.message : "unknown" }, message);
  return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
}
