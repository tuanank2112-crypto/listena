import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { submitAttempt } from "@/server/services/learning";
import { SubmitAttemptSchema } from "@/server/validation/schemas";
import logger from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = SubmitAttemptSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { validationError: parsed.error.flatten() },
        "Attempt validation failed"
      );
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await submitAttempt({
      userId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    if (message === "Exercise not found" || message === "Exercise does not belong to the lesson") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    logger.error({ error: message }, "Attempt submission failed");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
