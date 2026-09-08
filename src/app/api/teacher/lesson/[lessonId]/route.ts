import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { lessonId } = await params;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        segments: { orderBy: { position: "asc" } },
        vocabulary: { include: { vocabularyItem: true } },
        exercises: { orderBy: { position: "asc" } },
        course: { select: { title: true } },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (lesson.createdById !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(lesson);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Failed to fetch lesson");
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
