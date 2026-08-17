/**
 * Learner profile and vocabulary mastery repository.
 */

import { prisma } from "@/lib/prisma";
import type { CefrLevel } from "@prisma/client";

export const learnerRepo = {
  async getProfile(userId: string) {
    return prisma.learnerProfile.findUnique({
      where: { userId },
    });
  },

  async upsertProfile(userId: string, data: Partial<{
    estimatedCefrLevel: CefrLevel;
    listeningMastery: number;
    vocabularyMastery: number;
    spellingMastery: number;
    preferredAccent: string;
    preferredTopics: string;
    recommendedPlaybackRate: number;
    totalStudyMinutes: number;
    currentStreak: number;
    lastActivityAt: Date;
  }>) {
    return prisma.learnerProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  },

  async getVocabularyMastery(userId: string, vocabularyItemId: string) {
    return prisma.vocabularyMastery.findUnique({
      where: { userId_vocabularyItemId: { userId, vocabularyItemId } },
    });
  },

  async upsertVocabularyMastery(userId: string, vocabularyItemId: string, data: {
    masteryScore: number;
    correctCount?: number;
    incorrectCount?: number;
    lastReviewedAt?: Date;
    nextReviewAt?: Date;
    intervalDays?: number;
    easeFactor?: number;
    repetitionCount?: number;
  }) {
    const existing = await this.getVocabularyMastery(userId, vocabularyItemId);
    if (existing) {
      return prisma.vocabularyMastery.update({
        where: { id: existing.id },
        data,
      });
    }
    return prisma.vocabularyMastery.create({
      data: {
        userId,
        vocabularyItemId,
        masteryScore: data.masteryScore,
        correctCount: data.correctCount ?? 0,
        incorrectCount: data.incorrectCount ?? 0,
        lastReviewedAt: data.lastReviewedAt ?? new Date(),
        nextReviewAt: data.nextReviewAt ?? new Date(),
        intervalDays: data.intervalDays ?? 0,
        easeFactor: data.easeFactor ?? 2.5,
        repetitionCount: data.repetitionCount ?? 0,
      },
    });
  },

  async getSkillMastery(userId: string, skillKey: string) {
    return prisma.skillMastery.findUnique({
      where: { userId_skillKey: { userId, skillKey } },
    });
  },

  async upsertSkillMastery(userId: string, skillKey: string, data: {
    masteryScore: number;
    evidenceCount?: number;
  }) {
    const existing = await this.getSkillMastery(userId, skillKey);
    if (existing) {
      return prisma.skillMastery.update({
        where: { id: existing.id },
        data: {
          masteryScore: data.masteryScore,
          evidenceCount: (existing.evidenceCount + (data.evidenceCount ?? 1)),
          lastUpdatedAt: new Date(),
        },
      });
    }
    return prisma.skillMastery.create({
      data: {
        userId,
        skillKey,
        masteryScore: data.masteryScore,
        evidenceCount: data.evidenceCount ?? 1,
      },
    });
  },
};
