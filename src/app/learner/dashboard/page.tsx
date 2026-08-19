import { auth } from "@/server/auth/config";
import { prisma } from "@/lib/prisma";
import { LearnerDashboard } from "./dashboard-client";

const COURSE_TITLE = "TATQHP1 - SOLUTIONS Pre-Intermediate";

export default async function LearnerDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [profile, recentAttempts, cardsDueToday, skillMasteries, firstLesson] = await Promise.all([
    prisma.learnerProfile.findUnique({ where: { userId } }),
    prisma.attempt.findMany({
      where: {
        userId,
        lesson: { course: { title: COURSE_TITLE }, title: { startsWith: "Bài " } },
      },
      include: { lesson: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.flashcard.count({ where: { userId, active: true } }),
    prisma.skillMastery.findMany({ where: { userId } }),
    prisma.lesson.findFirst({
      where: { course: { title: COURSE_TITLE }, title: { startsWith: "Bài " }, status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const lastCurriculumAttempt = await prisma.attempt.findFirst({
    where: { userId, lesson: { course: { title: COURSE_TITLE }, title: { startsWith: "Bài " } } },
    orderBy: { createdAt: "desc" },
    select: { lesson: { select: { id: true, title: true } } },
  });
  const nextLesson = lastCurriculumAttempt?.lesson ?? firstLesson;

  return (
    <LearnerDashboard
      data={{
        greeting: session.user.name || "Bạn",
        continueLessonId: nextLesson?.id ?? null,
        recommendedLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title, reason: "Tiếp tục hành trình" } : null,
        cardsDueToday,
        currentStreak: profile?.currentStreak ?? 0,
        weeklyStudyTime: Math.min(profile?.totalStudyMinutes ?? 0, 120),
        listeningMastery: profile?.listeningMastery ?? 0.5,
        vocabularyMastery: profile?.vocabularyMastery ?? 0.5,
        weakSkills: skillMasteries.filter((item) => item.masteryScore < .5).map((item) => item.skillKey),
        recentAttempts: recentAttempts.map((attempt) => ({
          id: attempt.id,
          lessonTitle: attempt.lesson.title,
          score: attempt.score ?? 0,
          createdAt: attempt.createdAt,
        })),
      }}
    />
  );
}
