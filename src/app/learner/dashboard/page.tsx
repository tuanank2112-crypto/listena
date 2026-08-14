import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { LearnerDashboard } from "./dashboard-client";

export default async function LearnerDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  // Get profile
  const profile = await prisma.learnerProfile.findUnique({
    where: { userId },
  });

  // Get recent attempts
  const recentAttempts = await prisma.attempt.findMany({
    where: { userId },
    include: {
      lesson: { select: { title: true } },
      exercise: { select: { type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Get due flashcards count
  const cardsDueToday = await prisma.flashcard.count({
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

  // Get skill masteries
  const skillMasteries = await prisma.skillMastery.findMany({
    where: { userId },
  });

  const weakSkills = skillMasteries
    .filter((s) => s.masteryScore < 0.5)
    .map((s) => s.skillKey);

  // Get recommendations
  const recommendation = await prisma.recommendation.findFirst({
    where: { userId, status: "PENDING" },
    include: { lesson: { select: { id: true, title: true } } },
    orderBy: { score: "desc" },
  });

  // Weekly study time (mock for now)
  const weeklyStudyTime = Math.min(
    (profile?.totalStudyMinutes ?? 0),
    120
  );

  const data = {
    greeting: `Xin chào, ${session.user.name}!`,
    continueLessonId: null,
    recommendedLesson: recommendation
      ? { id: recommendation.lesson.id, title: recommendation.lesson.title, reason: recommendation.reason }
      : null,
    cardsDueToday,
    currentStreak: profile?.currentStreak ?? 0,
    weeklyStudyTime,
    listeningMastery: profile?.listeningMastery ?? 0.5,
    vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
    weakSkills,
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      lessonTitle: a.lesson.title,
      score: a.score ?? 0,
      createdAt: a.createdAt,
    })),
  };

  return <LearnerDashboard data={data} />;
}
