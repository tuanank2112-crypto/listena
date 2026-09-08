import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const learningSessionInclude = {
  lesson: {
    select: {
      id: true,
      title: true,
      topic: true,
      cefrLevel: true,
      audioUrl: true,
    },
  },
  turns: {
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      clientTurnId: true,
      actor: true,
      turnType: true,
      contentJson: true,
      skillTags: true,
      createdAt: true,
    },
  },
  evidence: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      turnId: true,
      skillKey: true,
      evidenceType: true,
      score: true,
      confidence: true,
      difficulty: true,
      hintCount: true,
      replayCount: true,
      responseTimeMs: true,
      createdAt: true,
    },
  },
  interventions: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sourceTurnId: true,
      type: true,
      prompt: true,
      specJson: true,
      status: true,
      outcomeJson: true,
      createdAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.LearningSessionInclude;

export type LearningSessionRecord = Prisma.LearningSessionGetPayload<{
  include: typeof learningSessionInclude;
}>;

export type LearningSessionSnapshot = Prisma.LearningSessionGetPayload<{
  include: {
    lesson: {
      select: {
        id: true;
        title: true;
        topic: true;
        transcript: true;
        learningObjectives: true;
        cefrLevel: true;
        vocabulary: {
          select: {
            isTarget: true;
            vocabularyItem: {
              select: {
                lemma: true;
                displayText: true;
                meaningVi: true;
                meaningEn: true;
                exampleSentence: true;
              };
            };
          };
        };
      };
    };
    turns: {
      select: {
        id: true;
        sequence: true;
        clientTurnId: true;
        actor: true;
        turnType: true;
        contentJson: true;
        createdAt: true;
      };
    };
    interventions: {
      select: {
        id: true;
        type: true;
        prompt: true;
        specJson: true;
        validatorJson: true;
        status: true;
      };
    };
  };
}>;

export class LearningSessionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(callback);
  }

  findLessonForStart(lessonId: string) {
    return this.db.lesson.findFirst({
      where: { id: lessonId, status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        topic: true,
        transcript: true,
        learningObjectives: true,
        cefrLevel: true,
        vocabulary: {
          where: { isTarget: true },
          orderBy: { importance: "desc" },
          take: 12,
          select: {
            isTarget: true,
            vocabularyItem: {
              select: {
                lemma: true,
                displayText: true,
                meaningVi: true,
                meaningEn: true,
                exampleSentence: true,
              },
            },
          },
        },
      },
    });
  }

  async findLearnerContext(userId: string) {
    const learner = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        learnerProfile: {
          select: {
            estimatedCefrLevel: true,
            preferredTopics: true,
            listeningMastery: true,
            vocabularyMastery: true,
            spellingMastery: true,
          },
        },
        skillMastery: {
          orderBy: { lastUpdatedAt: "desc" },
          take: 12,
          select: { skillKey: true, masteryScore: true },
        },
        vocabularyMastery: {
          where: { nextReviewAt: { lte: new Date() } },
          orderBy: [{ nextReviewAt: "asc" }, { vocabularyItemId: "asc" }],
          take: 8,
          select: {
            vocabularyItem: {
              select: { displayText: true },
            },
          },
        },
      },
    });
    if (!learner) return null;

    return {
      learnerProfile: learner.learnerProfile,
      skillMastery: learner.skillMastery,
      dueVocabulary: learner.vocabularyMastery.map(
        ({ vocabularyItem }) => vocabularyItem.displayText,
      ),
    };
  }

  findOwned(userId: string, sessionId: string): Promise<LearningSessionRecord | null> {
    return this.db.learningSession.findFirst({
      where: { id: sessionId, userId },
      include: learningSessionInclude,
    });
  }

  findOwnedSnapshot(userId: string, sessionId: string): Promise<LearningSessionSnapshot | null> {
    return this.db.learningSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            topic: true,
            transcript: true,
            learningObjectives: true,
            cefrLevel: true,
            vocabulary: {
              where: { isTarget: true },
              orderBy: { importance: "desc" },
              take: 12,
              select: {
                isTarget: true,
                vocabularyItem: {
                  select: {
                    lemma: true,
                    displayText: true,
                    meaningVi: true,
                    meaningEn: true,
                    exampleSentence: true,
                  },
                },
              },
            },
          },
        },
        turns: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            sequence: true,
            clientTurnId: true,
            actor: true,
            turnType: true,
            contentJson: true,
            createdAt: true,
          },
        },
        interventions: {
          select: {
            id: true,
            type: true,
            prompt: true,
            specJson: true,
            validatorJson: true,
            status: true,
          },
        },
      },
    });
  }
}

export function findOwnedSessionInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
) {
  return tx.learningSession.findFirst({ where: { id: sessionId, userId } });
}
