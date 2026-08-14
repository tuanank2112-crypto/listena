import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { reviewFlashcard } from "@/server/services/learning";
import { ReviewFlashcardSchema } from "@/server/validation/schemas";
import logger from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ReviewFlashcardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await reviewFlashcard({
      userId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, "Flashcard review failed");
    return NextResponse.json(
      { error: error.message || "Có lỗi xảy ra" },
      { status: 500 }
    );
  }
}
