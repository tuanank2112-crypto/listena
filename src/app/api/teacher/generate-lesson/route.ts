import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { createAIProviderFromEnv } from "@/server/ai/provider";
import { isAIProviderError } from "@/server/ai/errors";
import { GenerateLessonSchema, AILessonDraftSchema } from "@/server/validation/schemas";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import type { CefrLevel, ExerciseType } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = GenerateLessonSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Generate lesson draft with AI
    const aiProvider = createAIProviderFromEnv();

    const draft = await aiProvider.generateLesson({
      ...parsed.data,
      safetyIdentifier: session.user.id,
    });

    // Validate AI output
    const validated = AILessonDraftSchema.safeParse(draft);
    if (!validated.success) {
      logger.warn({ validationError: validated.error.format() }, "AI lesson draft validation failed");
      return NextResponse.json(
        { error: "AI tạo nội dung không hợp lệ, vui lòng thử lại" },
        { status: 422 }
      );
    }

    // Find or create default course
    let course = await prisma.course.findFirst({
      where: { createdById: session.user.id },
    });

    if (!course) {
      course = await prisma.course.create({
        data: {
          title: `Course - ${parsed.data.cefrLevel}`,
          description: `Auto-generated course for ${parsed.data.cefrLevel}`,
          cefrLevel: parsed.data.cefrLevel as CefrLevel,
          status: "DRAFT",
          createdById: session.user.id,
        },
      });
    }

    // Create lesson
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        title: validated.data.title,
        topic: parsed.data.topic,
        cefrLevel: parsed.data.cefrLevel as CefrLevel,
        learningObjectives: parsed.data.learningObjectives.join("\n"),
        transcript: validated.data.transcript,
        status: "DRAFT",
        createdById: session.user.id,
        estimatedMinutes: parsed.data.audioDuration ?? 10,
        segments: {
          create: validated.data.segments.map((s) => ({
            position: s.position,
            text: s.text,
            difficulty: s.difficulty,
          })),
        },
        exercises: {
          create: validated.data.exercises.map((e) => ({
            type: e.type as ExerciseType,
            prompt: e.prompt,
            correctAnswer: e.correctAnswer,
            difficulty: e.difficulty,
            position: e.position,
          })),
        },
      },
    });

    // Create vocabulary items
    for (const v of validated.data.vocabulary) {
      const item = await prisma.vocabularyItem.upsert({
        where: { lemma: v.lemma },
        create: {
          lemma: v.lemma,
          displayText: v.displayText,
          ipa: v.ipa,
          meaningVi: v.meaningVi,
          meaningEn: v.meaningEn,
          partOfSpeech: v.partOfSpeech,
          cefrLevel: v.cefrLevel as CefrLevel,
          exampleSentence: v.exampleSentence,
        },
        update: {},
      });
      await prisma.lessonVocabulary.create({
        data: {
          lessonId: lesson.id,
          vocabularyItemId: item.id,
          isTarget: true,
          importance: 1.0,
        },
      });
    }

    logger.info(
      { lessonId: lesson.id, userId: session.user.id },
      "AI lesson draft created"
    );

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    if (isAIProviderError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details.retryAfterSeconds
            ? { retryAfterSeconds: error.details.retryAfterSeconds }
            : {}),
        },
        {
          status: error.status,
          headers: error.details.retryAfterSeconds
            ? { "Retry-After": String(error.details.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "AI lesson generation failed");
    return NextResponse.json(
      { error: "Tạo bài học thất bại. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
