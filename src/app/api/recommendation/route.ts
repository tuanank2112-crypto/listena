import { NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { prisma } from "@/lib/prisma";
import { rankRecommendations } from "@/core/recommendation/engine";
import type { CefrLevel } from "@/core/recommendation/engine";
import { getLessonProgress } from "./history";
import logger from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const [profile, skillMasteries, lessons, vocabDueCount, attempts, learningSessions] = await Promise.all([
      prisma.learnerProfile.findUnique({ where: { userId } }),
      prisma.skillMastery.findMany({ where: { userId } }),
      prisma.lesson.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, title: true, cefrLevel: true, topic: true },
      }),
      prisma.vocabularyMastery.count({
        where: { userId, nextReviewAt: { lte: new Date() } },
      }),
      prisma.attempt.findMany({
        where: { userId },
        select: { lessonId: true, score: true, createdAt: true },
      }),
      prisma.learningSession.findMany({
        where: { userId, lessonId: { not: null } },
        select: {
          lessonId: true,
          status: true,
          updatedAt: true,
          completedAt: true,
          evidence: { select: { score: true } },
        },
      }),
    ]);

    const weakSkills = skillMasteries
      .filter((s) => s.masteryScore < 0.5)
      .map((s) => s.skillKey);

    const candidates = lessons.map((lesson) => {
      const progress = getLessonProgress(lesson.id, attempts, learningSessions);
      return {
        id: lesson.id,
        title: lesson.title,
        cefrLevel: lesson.cefrLevel as CefrLevel,
        topic: lesson.topic,
        difficulty: 1.0,
        completed: progress.completed,
        score: progress.score,
        teacherPriority: 0,
        isNew: progress.isNew,
      };
    });

    const context = {
      estimatedCefrLevel: (profile?.estimatedCefrLevel ?? "A2") as CefrLevel,
      listeningMastery: profile?.listeningMastery ?? 0.5,
      vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
      spellingMastery: profile?.spellingMastery ?? 0.5,
      preferredTopics: (profile?.preferredTopics ? profile.preferredTopics.split(",").filter(Boolean) : []) as string[],
      weakSkills,
      vocabularyDueCount: vocabDueCount,
    };

    const recommendations = rankRecommendations(candidates, context, 5);

    // This endpoint is deliberately read/compute-only. A GET must remain
    // harmless during a fenced migration and when the framework re-renders.
    logger.info({ userId, recommendations: recommendations.length }, "Recommendations computed");

    return NextResponse.json({ recommendations });
  } catch (error) {
    const databaseResponse = databaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;

    const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
    logger.error({ error: message }, "Recommendation generation failed");
    return NextResponse.json(
      { error: "Có lỗi xảy ra" },
      { status: 500 }
    );
  }
}
