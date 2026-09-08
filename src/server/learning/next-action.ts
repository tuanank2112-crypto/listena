import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLearnerMemory } from "@/server/learner-memory/repository";
import { isMissionScenarioKey } from "@/server/ai/mission-templates";
import type { NextAction } from "@/features/learning-session/types";

export type { NextAction } from "@/features/learning-session/types";

export async function computeNextAction(
  userId: string,
  sessionId?: string,
): Promise<NextAction | null> {
  const evidence = await prisma.learningEvidence.findMany({
    where: {
      ...(sessionId ? { sessionId } : {}),
      session: { userId },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (!evidence.length) return null;

  const evidenceRefs = evidence.map((item) => item.id);
  const memory = await getLearnerMemory(userId);
  const recurringError = memory?.recurringErrors
    .filter((item) => (
      typeof item.errorType === "string" &&
      item.errorType.trim().length > 0 &&
      Number.isInteger(item.count) &&
      item.count >= 3 &&
      typeof item.lastEvidenceId === "string" &&
      item.lastEvidenceId.length > 0
    ))
    .sort((left, right) => right.count - left.count)[0];

  // Memory is advisory only. Its cited evidence must still be owned by the
  // learner; recurring errors intentionally survive across sessions.
  if (recurringError) {
    const referencedEvidence = await prisma.learningEvidence.findFirst({
      where: {
        id: recurringError.lastEvidenceId,
        session: { userId },
      },
      select: { id: true },
    });
    if (referencedEvidence) {
      return {
        kind: "PRACTICE",
        scenarioKey: await nextMissionScenario(userId, sessionId),
        goal: `Practice correcting ${recurringError.errorType} in short English answers.`,
        reason: `Bạn đã lặp lại lỗi ${formatErrorType(recurringError.errorType)} ${recurringError.count} lần gần đây. Hãy luyện lại trước khi đi tiếp.`,
        evidenceRefs: [referencedEvidence.id],
      };
    }
  }

  const weakestSkill = await prisma.skillMastery.findFirst({
    where: { userId, masteryScore: { lt: 0.6 } },
    orderBy: [{ masteryScore: "asc" }, { lastUpdatedAt: "asc" }],
    select: { skillKey: true, masteryScore: true },
  });
  if (weakestSkill) {
    const lesson = await findCoachLesson(userId, weakestSkill.skillKey);
    if (lesson) {
      return {
        kind: "COACH",
        targetId: lesson.id,
        reason: `Kỹ năng ${formatSkill(weakestSkill.skillKey)} đang cần củng cố (${Math.round(weakestSkill.masteryScore * 100)}%). Coach sẽ dùng bài “${lesson.title}” để luyện đúng điểm này.`,
        evidenceRefs,
      };
    }
    return practiceFallback(
      `Chưa có bài Coach chưa học phù hợp với kỹ năng ${formatSkill(weakestSkill.skillKey)}. Hãy ôn lại phần cần sửa trước.`,
      evidenceRefs,
    );
  }

  const dueVocabulary = await prisma.vocabularyMastery.findFirst({
    where: {
      userId,
      nextReviewAt: { lte: new Date() },
      vocabularyItem: {
        lessons: { some: { lesson: { status: "PUBLISHED" } } },
      },
    },
    orderBy: [{ nextReviewAt: "asc" }, { vocabularyItemId: "asc" }],
    select: {
      vocabularyItem: {
        select: {
          displayText: true,
          lessons: {
            where: { lesson: { status: "PUBLISHED" } },
            orderBy: { importance: "desc" },
            take: 1,
            select: { lessonId: true, lesson: { select: { title: true } } },
          },
        },
      },
    },
  });
  const questLessonId = dueVocabulary?.vocabularyItem.lessons[0]?.lessonId;
  if (dueVocabulary && questLessonId) {
    return {
      kind: "QUEST",
      targetId: questLessonId,
      reason: `Từ “${dueVocabulary.vocabularyItem.displayText}” đã đến hạn ôn. Daily Quest sẽ dùng bài “${dueVocabulary.vocabularyItem.lessons[0].lesson.title}” để đưa từ này vào ngữ cảnh mới.`,
      evidenceRefs,
    };
  }

  const scenarioKey = await nextMissionScenario(userId, sessionId);
  if (isMissionScenarioKey(scenarioKey)) {
    const latestEvidence = evidence[0];
    return {
      kind: "MISSION",
      scenarioKey,
      reason: `Bạn vừa luyện ${formatSkill(latestEvidence.skillKey)} với mức ${Math.round(latestEvidence.score * 100)}%. Hãy dùng lại kỹ năng đó trong một Mission khác.`,
      evidenceRefs,
    };
  }
  return practiceFallback("Chưa thể tạo Mission hợp lệ. Hãy ôn lại phần cần sửa trước.", evidenceRefs);
}

async function findCoachLesson(userId: string, skillKey: string) {
  const profile = await prisma.learnerProfile.findUnique({
    where: { userId },
    select: { estimatedCefrLevel: true },
  });
  const relatedToSkill = skillLessonFilter(skillKey);
  if (!relatedToSkill) return null;

  return await prisma.lesson.findFirst({
    where: {
      status: "PUBLISHED",
      ...(profile ? { cefrLevel: profile.estimatedCefrLevel } : {}),
      attempts: { none: { userId } },
      learningSessions: {
        none: { userId, mode: "LESSON_COACH", status: "COMPLETED" },
      },
      ...relatedToSkill,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });
}

function skillLessonFilter(skillKey: string): Prisma.LessonWhereInput | null {
  const textMatch = [
    { topic: { contains: skillKey } },
    { learningObjectives: { contains: skillKey } },
    { transcript: { contains: skillKey } },
  ];
  switch (skillKey) {
    case "listening":
      return { OR: [...textMatch, { exercises: { some: { type: { in: ["GIST", "PARTIAL_DICTATION", "FULL_DICTATION"] } } } }] };
    case "vocabulary":
      return { OR: [...textMatch, { vocabulary: { some: { isTarget: true } } }] };
    case "spelling":
      return { OR: [...textMatch, { exercises: { some: { type: { in: ["PARTIAL_DICTATION", "FULL_DICTATION"] } } } }] };
    case "grammar":
    case "communication":
      return { OR: textMatch };
    default:
      return null;
  }
}

async function nextMissionScenario(userId: string, sessionId: string | undefined) {
  if (!sessionId) return "cafe-order";
  const session = await prisma.learningSession.findFirst({
    where: { id: sessionId, userId },
    select: { stateJson: true },
  });
  const previous = session ? readScenarioKey(session.stateJson) : null;
  return (["cafe-order", "lost-luggage", "mystery-clue"] as const)
    .find((candidate) => candidate !== previous) ?? "cafe-order";
}

function readScenarioKey(stateJson: string) {
  try {
    const parsed = JSON.parse(stateJson) as { scenarioKey?: unknown };
    return parsed && typeof parsed.scenarioKey === "string" && isMissionScenarioKey(parsed.scenarioKey)
      ? parsed.scenarioKey
      : null;
  } catch {
    return null;
  }
}

function practiceFallback(reason: string, evidenceRefs: string[]): NextAction {
  return { kind: "PRACTICE", scenarioKey: "lost-luggage", goal: reason.slice(0, 240), reason, evidenceRefs };
}

function formatSkill(skillKey: string) {
  const labels: Record<string, string> = {
    listening: "nghe",
    vocabulary: "từ vựng",
    spelling: "chính tả",
    grammar: "ngữ pháp",
    communication: "giao tiếp",
  };
  return labels[skillKey] ?? skillKey;
}

function formatErrorType(errorType: string) {
  return errorType.replaceAll("_", " ").toLowerCase();
}
