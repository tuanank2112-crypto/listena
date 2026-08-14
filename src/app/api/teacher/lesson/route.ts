import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { CreateLessonSchema } from "@/server/validation/schemas";
import logger from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateLessonSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const lesson = await prisma.lesson.create({
      data: {
        courseId: parsed.data.courseId,
        title: parsed.data.title,
        topic: parsed.data.topic,
        cefrLevel: parsed.data.cefrLevel as any,
        learningObjectives: parsed.data.learningObjectives,
        transcript: parsed.data.transcript,
        audioUrl: parsed.data.audioUrl,
        accent: parsed.data.accent,
        defaultPlaybackRate: parsed.data.defaultPlaybackRate,
        estimatedMinutes: parsed.data.estimatedMinutes,
        status: "DRAFT",
        createdById: session.user.id,
        segments: {
          create: parsed.data.segments.map((s) => ({
            position: s.position,
            text: s.text,
            difficulty: s.difficulty,
          })),
        },
        exercises: {
          create: parsed.data.exercises.map((e) => ({
            type: e.type as any,
            prompt: e.prompt,
            correctAnswer: e.correctAnswer,
            difficulty: e.difficulty,
            position: e.position,
          })),
        },
      },
    });

    // Create vocabulary items
    for (const v of parsed.data.vocabulary) {
      const item = await prisma.vocabularyItem.upsert({
        where: { id: v.lemma },
        create: {
          lemma: v.lemma,
          displayText: v.displayText,
          ipa: v.ipa,
          meaningVi: v.meaningVi,
          meaningEn: v.meaningEn,
          partOfSpeech: v.partOfSpeech,
          cefrLevel: v.cefrLevel as any,
          exampleSentence: v.exampleSentence,
        },
        update: {},
      });
      await prisma.lessonVocabulary.create({
        data: {
          lessonId: lesson.id,
          vocabularyItemId: item.id,
          isTarget: v.isTarget,
          importance: v.importance,
        },
      });
    }

    logger.info(
      { lessonId: lesson.id, userId: session.user.id },
      "Lesson created manually"
    );

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Lesson creation failed");
    return NextResponse.json(
      { error: "Tạo bài học thất bại" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing lesson ID" }, { status: 400 });
    }

    const lesson = await prisma.lesson.findUnique({ where: { id } });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (lesson.createdById !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "publish") {
      await prisma.lesson.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          reviewedById: session.user.id,
        },
      });
      logger.info({ lessonId: id, userId: session.user.id }, "Lesson published");
      return NextResponse.json({ status: "PUBLISHED" });
    }

    if (action === "review") {
      await prisma.lesson.update({
        where: { id },
        data: { status: "REVIEWED" },
      });
      return NextResponse.json({ status: "REVIEWED" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Lesson update failed");
    return NextResponse.json({ error: "Cập nhật thất bại" }, { status: 500 });
  }
}
