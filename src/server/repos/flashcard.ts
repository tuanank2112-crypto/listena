/**
 * Flashcard and review log repository.
 */

import { prisma } from "@/lib/prisma";

export const flashcardRepo = {
  async create(data: {
    userId: string;
    vocabularyItemId: string;
    sourceAttemptId?: string;
    front: string;
    back: string;
    cardType?: string;
  }) {
    return prisma.flashcard.create({
      data: {
        userId: data.userId,
        vocabularyItemId: data.vocabularyItemId,
        sourceAttemptId: data.sourceAttemptId,
        front: data.front,
        back: data.back,
        cardType: data.cardType ?? "TEXT_MEANING",
      },
    });
  },

  async getDueFlashcards(userId: string, limit: number = 20) {
    return prisma.flashcard.findMany({
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
      include: {
        vocabularyItem: true,
        reviewLogs: { orderBy: { reviewedAt: "desc" }, take: 1 },
      },
      take: limit,
    });
  },

  async getDueCount(userId: string): Promise<number> {
    return prisma.flashcard.count({
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
  },

  async createReviewLog(data: {
    flashcardId: string;
    userId: string;
    rating: string;
    responseTimeMs?: number;
    previousInterval: number;
    nextInterval: number;
  }) {
    return prisma.reviewLog.create({
      data: {
        flashcardId: data.flashcardId,
        userId: data.userId,
        rating: data.rating as any,
        responseTimeMs: data.responseTimeMs,
        previousInterval: data.previousInterval,
        nextInterval: data.nextInterval,
      },
    });
  },
};
