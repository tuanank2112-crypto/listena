import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { LessonDetailClient } from "./lesson-client";
import { getDatasetUnit, getUnitLearningContext } from "@/server/dataset/catalog";
import { toPublicExerciseMetadataJson, toPublicLastAttemptMap } from "./public-exercise";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      segments: { orderBy: { position: "asc" } },
      vocabulary: { include: { vocabularyItem: true } },
      exercises: { orderBy: { position: "asc" } },
      course: { select: { title: true } },
    },
  });

  if (!lesson || lesson.status !== "PUBLISHED") notFound();

  const lastAttempts = await prisma.attempt.findMany({
    where: { userId, lessonId },
    orderBy: { createdAt: "desc" },
    distinct: ["exerciseId"],
    select: { exerciseId: true, score: true },
  });
  const learningContext = getUnitLearningContext(getDatasetUnit(lesson.title));
  // Correct answers remain on the server for `/api/attempt`; the learner page
  // receives only content needed to render the question. `metadata` is
  // projected through an allow-list (Plan13 L2) because the importer stores
  // `answers` / `sourceAnswers` next to the rendering fields.
  const publicLesson = {
    ...lesson,
    exercises: lesson.exercises.map(({ correctAnswer: _correctAnswer, metadata, ...exercise }) => ({
      ...exercise,
      metadata: toPublicExerciseMetadataJson(metadata),
    })),
  };

  return (
    <LessonDetailClient
      userId={userId}
      lesson={JSON.parse(JSON.stringify(publicLesson))}
      lastAttemptMap={toPublicLastAttemptMap(lastAttempts)}
      learningContext={learningContext}
    />
  );
}
