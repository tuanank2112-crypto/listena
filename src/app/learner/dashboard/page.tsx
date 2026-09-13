import { auth } from "@/server/auth/config";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  resolveDisplayMastery,
  resolveDisplaySkillObservation,
} from "@/server/learning/mastery-display";
import { getLearnerTimeline } from "@/server/learning/timeline";
import { planNextLearningAction } from "@/server/learning/planner";
import { LearnerDashboard } from "./dashboard-client";

export default async function LearnerDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const nextDecision = planNextLearningAction(userId).catch((error) => {
    // The dashboard remains useful when this optional, read-only planner is
    // temporarily unavailable. Never substitute an invented recommendation.
    logger.warn({ error, userId }, "Learning planner unavailable for dashboard");
    return null;
  });

  const [profile, recentAttempts, cardsDueToday, skillMasteries, firstLesson, activeSession, timeline, plannedDecision] = await Promise.all([
    prisma.learnerProfile.findUnique({ where: { userId } }),
    prisma.attempt.findMany({
      where: {
        userId,
        lesson: { status: "PUBLISHED" },
      },
      include: { lesson: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.flashcard.count({
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
    }),
    prisma.skillMastery.findMany({ where: { userId } }),
    prisma.lesson.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.learningSession.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, goal: true },
    }),
    getLearnerTimeline(userId),
    nextDecision,
  ]);

  const lastCurriculumAttempt = await prisma.attempt.findFirst({
    where: { userId, lesson: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    select: { lesson: { select: { id: true, title: true } } },
  });
  const nextLesson = lastCurriculumAttempt?.lesson ?? firstLesson;
  const listeningObservation = resolveDisplaySkillObservation("listening", skillMasteries, profile);
  const vocabularyObservation = resolveDisplaySkillObservation("vocabulary", skillMasteries, profile);

  return (
    <LearnerDashboard
      data={{
        greeting: session.user.name || "Bạn",
        activeSession,
        nextDecision: plannedDecision,
        continueLessonId: nextLesson?.id ?? null,
        recommendedLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title, reason: "Tiếp tục hành trình" } : null,
        cardsDueToday,
        currentStreak: profile?.currentStreak ?? 0,
        weeklyStudyTime: timeline.weeklyStudyTime,
        listeningMastery: resolveDisplayMastery("listening", skillMasteries, profile),
        vocabularyMastery: resolveDisplayMastery("vocabulary", skillMasteries, profile),
        skillObservations: [listeningObservation, vocabularyObservation],
        weakSkills: skillMasteries.filter((item) => item.masteryScore < .5).map((item) => item.skillKey),
        recentAttempts: recentAttempts.map((attempt) => ({
          id: attempt.id,
          lessonTitle: attempt.lesson.title,
          score: attempt.score ?? 0,
          createdAt: attempt.createdAt,
        })),
        timeline,
      }}
    />
  );
}
