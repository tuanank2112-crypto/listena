import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { FlashcardsClient } from "./flashcards-client";

export default async function FlashcardsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const flashcards = await prisma.flashcard.findMany({
    where: { userId, active: true },
    include: {
      vocabularyItem: true,
      reviewLogs: { orderBy: { reviewedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get due count
  const dueCount = await prisma.flashcard.count({
    where: {
      userId,
      active: true,
      vocabularyItem: {
        mastery: {
          some: {
            userId,
            nextReviewAt: { lte: new Date() },
          },
        },
      },
    },
  });

  const totalCount = flashcards.length;

  return (
    <FlashcardsClient
      flashcards={JSON.parse(JSON.stringify(flashcards))}
      dueCount={dueCount}
      totalCount={totalCount}
    />
  );
}
