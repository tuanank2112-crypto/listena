import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AttemptResultClient } from "./result-client";

export default async function AttemptResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      errors: true,
      exercise: true,
      lesson: {
        select: { id: true, title: true, transcript: true, cefrLevel: true },
      },
      flashcards: {
        include: { vocabularyItem: true },
      },
    },
  });

  if (!attempt || attempt.userId !== userId) {
    notFound();
  }

  // Get recommendations for next lesson
  const recommendation = await prisma.recommendation.findFirst({
    where: { userId, status: "PENDING" },
    include: { lesson: { select: { id: true, title: true } } },
    orderBy: { score: "desc" },
  });

  return (
    <AttemptResultClient
      attempt={JSON.parse(JSON.stringify(attempt))}
      recommendation={recommendation
        ? { id: recommendation.lesson.id, title: recommendation.lesson.title }
        : null}
    />
  );
}
