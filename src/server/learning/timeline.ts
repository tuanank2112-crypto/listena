import { prisma } from "@/lib/prisma";
import type { LearnerTimeline, TimelineItem } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMELINE_ITEMS = 50;

function sessionMinutes(startedAt: Date, completedAt: Date) {
  const minutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60_000);
  return Math.max(1, Math.min(120, minutes));
}

/** Returns public activity for one learner; only displayed activity is capped. */
export async function getLearnerTimeline(
  userId: string,
  windowDays: 7 | 30 = 7,
): Promise<LearnerTimeline> {
  const now = new Date();
  const displaySince = new Date(now.getTime() - windowDays * DAY_MS);
  const weeklySince = new Date(now.getTime() - 7 * DAY_MS);

  const [sessions, evidence, attempts, reviews, weeklySessions] = await Promise.all([
    prisma.learningSession.findMany({
      where: { userId, status: "COMPLETED", completedAt: { gte: displaySince, lte: now } },
      select: { id: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: MAX_TIMELINE_ITEMS,
    }),
    prisma.learningEvidence.findMany({
      where: { session: { userId }, createdAt: { gte: displaySince, lte: now } },
      select: { id: true, createdAt: true, score: true, skillKey: true },
      orderBy: { createdAt: "desc" },
      take: MAX_TIMELINE_ITEMS,
    }),
    prisma.attempt.findMany({
      where: { userId, createdAt: { gte: displaySince, lte: now } },
      select: { id: true, createdAt: true, score: true },
      orderBy: { createdAt: "desc" },
      take: MAX_TIMELINE_ITEMS,
    }),
    prisma.reviewLog.findMany({
      where: { userId, reviewedAt: { gte: displaySince, lte: now } },
      select: { id: true, reviewedAt: true },
      orderBy: { reviewedAt: "desc" },
      take: MAX_TIMELINE_ITEMS,
    }),
    prisma.learningSession.findMany({
      where: { userId, status: "COMPLETED", completedAt: { gte: weeklySince, lte: now } },
      select: { startedAt: true, completedAt: true },
    }),
  ]);

  const items: TimelineItem[] = [
    ...sessions.flatMap((session) => session.completedAt ? [{ kind: "SESSION" as const, id: session.id, createdAt: session.completedAt.toISOString() }] : []),
    ...evidence.map((item) => ({ kind: "EVIDENCE" as const, id: item.id, createdAt: item.createdAt.toISOString(), score: item.score, skillKey: item.skillKey })),
    ...attempts.map((item) => ({ kind: "ATTEMPT" as const, id: item.id, createdAt: item.createdAt.toISOString(), score: item.score ?? undefined })),
    ...reviews.map((item) => ({ kind: "REVIEW" as const, id: item.id, createdAt: item.reviewedAt.toISOString() })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, MAX_TIMELINE_ITEMS);

  const weeklyStudyTime = weeklySessions.reduce((total, session) => (
    session.completedAt ? total + sessionMinutes(session.startedAt, session.completedAt) : total
  ), 0);

  return { items, weeklyStudyTime };
}
