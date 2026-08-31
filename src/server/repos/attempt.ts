/**
 * Attempt repository for database operations.
 */

import { prisma } from "@/lib/prisma";
import type { Attempt, AttemptError, ErrorType } from "@prisma/client";

export interface CreateAttemptInput {
  userId: string;
  lessonId: string;
  exerciseId: string;
  submittedAnswer: string;
  normalizedAnswer?: string;
  score?: number;
  completionTimeMs?: number;
  replayCount: number;
  hintCount: number;
  playbackRate: number;
}

export interface CreateAttemptErrorInput {
  attemptId: string;
  errorType: string;
  expectedText: string;
  actualText?: string | null;
  position: number;
  confidence: number;
  aiExplanation?: string;
  remediationType?: string;
}

export const attemptRepo = {
  async create(input: CreateAttemptInput) {
    return prisma.attempt.create({
      data: {
        userId: input.userId,
        lessonId: input.lessonId,
        exerciseId: input.exerciseId,
        submittedAnswer: input.submittedAnswer,
        normalizedAnswer: input.normalizedAnswer,
        score: input.score,
        completionTimeMs: input.completionTimeMs,
        replayCount: input.replayCount,
        hintCount: input.hintCount,
        playbackRate: input.playbackRate,
      },
    });
  },

  async createError(input: CreateAttemptErrorInput) {
    return prisma.attemptError.create({
      data: {
        attemptId: input.attemptId,
        errorType: input.errorType as ErrorType,
        expectedText: input.expectedText,
        actualText: input.actualText,
        position: input.position,
        confidence: input.confidence,
        aiExplanation: input.aiExplanation,
        remediationType: input.remediationType,
      },
    });
  },

  async findById(id: string) {
    return prisma.attempt.findUnique({
      where: { id },
      include: {
        errors: true,
        exercise: true,
        lesson: { select: { title: true, transcript: true } },
      },
    });
  },

  async findByUserAndLesson(userId: string, lessonId: string) {
    return prisma.attempt.findMany({
      where: { userId, lessonId },
      include: { errors: true, exercise: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getRecentAttempts(userId: string, limit: number = 5) {
    return prisma.attempt.findMany({
      where: { userId },
      include: {
        lesson: { select: { title: true } },
        exercise: { select: { type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
