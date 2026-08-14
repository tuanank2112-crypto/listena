import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { rankRecommendations } from "@/core/recommendation/engine";
import type { CefrLevel } from "@/core/recommendation/engine";
import logger from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get learner profile
    const profile = await prisma.learnerProfile.findUnique({
      where: { userId },
    });

    // Get skill masteries for weak skills
    const skillMasteries = await prisma.skillMastery.findMany({
      where: { userId },
    });

    // Get all available lessons
    const lessons = await prisma.lesson.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        cefrLevel: true,
        topic: true,
        difficulty: true,
        attempts: {
          where: { userId },
          select: { score: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Get vocabulary due count
    const vocabDueCount = await prisma.vocabularyMastery.count({
      where: {
        userId,
        nextReviewAt: { lte: new Date() },
      },
    });

    const weakSkills = skillMasteries
      .filter((s) => s.masteryScore < 0.5)
      .map((s) => s.skillKey);

    const candidates = lessons.map((l) => ({
      id: l.id,
      title: l.title,
      cefrLevel: l.cefrLevel as CefrLevel,
      topic: l.topic,
      difficulty: l.difficulty ?? 1.0,
      completed: l.attempts.length > 0,
      score: l.attempts[0]?.score ?? 0,
      teacherPriority: 0,
      isNew: l.attempts.length === 0,
    }));

    const context = {
      estimatedCefrLevel: (profile?.estimatedCefrLevel ?? "A2") as CefrLevel,
      listeningMastery: profile?.listeningMastery ?? 0.5,
      vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
      spellingMastery: profile?.spellingMastery ?? 0.5,
      preferredTopics: profile?.preferredTopics ?? [],
      weakSkills,
      vocabularyDueCount: vocabDueCount,
    };

    const recommendations = rankRecommendations(candidates, context, 5);

    // Save recommendations
    for (const rec of recommendations) {
      await prisma.recommendation.upsert({
        where: {
          userId_lessonId: { userId, lessonId: rec.lessonId },
        },
        update: {
          score: rec.score,
          reason: rec.reasons[0] ?? "Bài học phù hợp",
          status: "PENDING",
          generatedAt: new Date(),
        },
        create: {
          userId,
          lessonId: rec.lessonId,
          score: rec.score,
          reason: rec.reasons[0] ?? "Bài học phù hợp",
          status: "PENDING",
        },
      });
    }

    logger.info({ userId, recommendations: recommendations.length }, "Recommendations generated");

    return NextResponse.json({ recommendations });
  } catch (error: any) {
    logger.error({ error: error.message }, "Recommendation generation failed");
    return NextResponse.json(
      { error: "Có lỗi xảy ra" },
      { status: 500 }
    );
  }
}
