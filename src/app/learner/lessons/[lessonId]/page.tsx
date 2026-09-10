import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { LessonDetailClient } from "./lesson-client";
import { getDatasetUnit, getUnitLearningContext } from "@/server/dataset/catalog";

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

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

  const lastAttempts = userId
    ? await prisma.attempt.findMany({
        where: { userId, lessonId },
        orderBy: { createdAt: "desc" },
        distinct: ["exerciseId"],
      })
    : [];
  const learningContext = getUnitLearningContext(getDatasetUnit(lesson.title));
  // Correct answers remain on the server for `/api/attempt`; the learner page
  // receives only content needed to render the question.
  const publicLesson = {
    ...lesson,
    exercises: lesson.exercises.map(({ correctAnswer: _correctAnswer, ...exercise }) => exercise),
  };

  return (
    <LessonDetailClient
      lesson={JSON.parse(JSON.stringify(publicLesson))}
      lastAttemptMap={Object.fromEntries(lastAttempts.map((attempt) => [attempt.exerciseId, attempt]))}
      learningContext={learningContext}
    />
  );
}
