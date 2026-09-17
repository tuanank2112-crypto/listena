import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { FlashcardsClient } from "./flashcards-client";
import type { Prisma } from "@prisma/client";
import { groupDueFlashcardsByVocabulary } from "./group-due-flashcards";

/** Upper bound on due cards read per page load; the page shows one per word. */
const DUE_FLASHCARD_QUERY_LIMIT = 500;

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

  const [dueFlashcards, totalCount] = await Promise.all([
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
      take: DUE_FLASHCARD_QUERY_LIMIT,
    }),
    prisma.flashcard.count({ where: { userId, active: true } }),
  ]);

  // Plan13 L5: one card per vocabularyItemId; nothing is deleted.
  const flashcards = groupDueFlashcardsByVocabulary(dueFlashcards);

  return (
    <FlashcardsClient
      userId={userId}
      flashcards={flashcards}
      dueCount={flashcards.length}
      totalCount={totalCount}
    />
  );
}
