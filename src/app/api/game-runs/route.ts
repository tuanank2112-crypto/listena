import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { CreateAdaptiveGameRunSchema } from "@/server/adaptive-games/contracts";
import { createAdaptiveGameRun } from "@/server/adaptive-games/service";
import { adaptiveGameErrorResponse } from "@/server/adaptive-games/route-response";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = CreateAdaptiveGameRunSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Chế độ game không hợp lệ" },
      { status: 400 },
    );
  }

  try {
    const run = await createAdaptiveGameRun(session.user.id, parsed.data);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return adaptiveGameErrorResponse(error);
  }
}

