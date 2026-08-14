import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { LessonDetailClient } from "./lesson-client";

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
      vocabulary: {
        include: { vocabularyItem: true },
      },
      exercises: { orderBy: { position: "asc" } },
      course: { select: { title: true } },
    },
  });

  if (!lesson || lesson.status !== "PUBLISHED") {
    notFound();
  }

  // Get last attempt for each exercise
  const lastAttempts = userId
    ? await prisma.attempt.findMany({
        where: { userId, lessonId },
        orderBy: { createdAt: "desc" },
        distinct: ["exerciseId"],
      })
    : [];

  const lastAttemptMap = new Map(
    lastAttempts.map((a) => [a.exerciseId, a])
  );

  return (
    <LessonDetailClient
      lesson={JSON.parse(JSON.stringify(lesson))}
      lastAttemptMap={Object.fromEntries(lastAttemptMap)}
    />
  );
}
