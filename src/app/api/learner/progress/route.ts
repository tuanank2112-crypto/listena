import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const profile = await prisma.learnerProfile.findUnique({ where: { userId } });
    const skillMasteries = await prisma.skillMastery.findMany({ where: { userId } });

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
        vocabularyItem: {
          mastery: {
            some: { userId, nextReviewAt: { lte: new Date() } },
          },
        },
      },
    });

    const weeklyStudyTime = Math.min(profile?.totalStudyMinutes ?? 0, 120);

    return NextResponse.json({
      listeningMastery: profile?.listeningMastery ?? 0.5,
      vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
      spellingMastery: profile?.spellingMastery ?? 0.5,
      totalStudyMinutes: profile?.totalStudyMinutes ?? 0,
      currentStreak: profile?.currentStreak ?? 0,
      weeklyStudyTime,
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
