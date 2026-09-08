import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { getLearnerTimeline } from "@/server/learning/timeline";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [profile, skillMasteries, timeline] = await Promise.all([
      prisma.learnerProfile.findUnique({ where: { userId } }),
      prisma.skillMastery.findMany({ where: { userId } }),
      getLearnerTimeline(userId),
    ]);

    const recentAttempts = await prisma.attempt.findMany({
      where: { userId },
      include: { lesson: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const cardsDueToday = await prisma.flashcard.count({
      where: {
        userId,
        active: true,
        OR: [
          { vocabularyItem: { mastery: { none: { userId } } } },
          {
            vocabularyItem: {
              mastery: {
                some: { userId, nextReviewAt: { lte: new Date() } },
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({
      listeningMastery: profile?.listeningMastery ?? 0.5,
      vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
      spellingMastery: profile?.spellingMastery ?? 0.5,
      totalStudyMinutes: profile?.totalStudyMinutes ?? 0,
      currentStreak: profile?.currentStreak ?? 0,
      weeklyStudyTime: timeline.weeklyStudyTime,
      cardsDueToday,
      recentScores: recentAttempts.map((a) => ({
        date: a.createdAt.toISOString(),
        score: a.score ?? 0,
        lessonTitle: a.lesson.title,
      })),
      skillMasteries: skillMasteries.map((s) => ({
        skillKey: s.skillKey,
        masteryScore: s.masteryScore,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    logger.error({ error: message }, "Failed to fetch progress");
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}
