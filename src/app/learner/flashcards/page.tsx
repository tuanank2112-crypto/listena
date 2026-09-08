import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { FlashcardsClient } from "./flashcards-client";
import type { Prisma } from "@prisma/client";

export default async function FlashcardsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const now = new Date();
  const dueWhere = {
    userId,
    active: true,
    OR: [
      {
        vocabularyItem: {
          mastery: { none: { userId } },
        },
      },
      {
        vocabularyItem: {
          mastery: {
            some: {
              userId,
              nextReviewAt: { lte: now },
            },
          },
        },
      },
    ],
  } satisfies Prisma.FlashcardWhereInput;

  const [flashcards, totalCount] = await Promise.all([
    prisma.flashcard.findMany({
      where: dueWhere,
      select: {
        id: true,
        front: true,
        vocabularyItem: {
          select: {
            id: true,
            displayText: true,
            meaningVi: true,
            ipa: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.flashcard.count({ where: { userId, active: true } }),
  ]);

  return (
    <FlashcardsClient
      flashcards={flashcards}
      dueCount={flashcards.length}
      totalCount={totalCount}
    />
  );
}
