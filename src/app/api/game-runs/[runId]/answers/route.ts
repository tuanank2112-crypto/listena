import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/config";
import { SubmitAdaptiveGameAnswerSchema } from "@/server/adaptive-games/contracts";
import { submitAdaptiveGameAnswer } from "@/server/adaptive-games/service";
import { adaptiveGameErrorResponse } from "@/server/adaptive-games/route-response";

const RouteParamsSchema = z.object({ runId: z.string().uuid() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [routeParams, body] = await Promise.all([
    params,
    request.json().catch(() => null),
  ]);
  const parsedParams = RouteParamsSchema.safeParse(routeParams);
  const parsedBody = SubmitAdaptiveGameAnswerSchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Câu trả lời game không hợp lệ" },
      { status: 400 },
    );
  }

  try {
    const result = await submitAdaptiveGameAnswer(
      session.user.id,
      parsedParams.data.runId,
      parsedBody.data,
    );
    return NextResponse.json(
      { result },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return adaptiveGameErrorResponse(error);
  }
}

