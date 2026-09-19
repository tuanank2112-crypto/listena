import "server-only";

import type { Prisma } from "@prisma/client";
import { selectDailyQuestScenarioDetail } from "@/server/ai/daily-quest";
import { isKnownScenarioKey } from "@/server/ai/mission-templates";
import { getLearnerIntent } from "@/server/learner-intent";
import { getLearnerMemory } from "@/server/learner-memory/repository";
import { prisma } from "@/lib/prisma";
import { aggregateRecurringErrors } from "@/core/learning/error-taxonomy";
import type { EvidenceRef, LearningDecision } from "./decision";

const MAX_PLANNING_EVIDENCE = 50;
const MAX_EVIDENCE_REFS = 12;
/**
 * Daily Quest day boundary. Learners are in Vietnam; a UTC key would roll the
 * quest over at 07:00 local time (Plan13 P132 §7).
 */
export const PLANNER_TIME_ZONE = "Asia/Ho_Chi_Minh";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANNER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type Observation = EvidenceRef & {
  skillKey: string;
  score: number;
  confidence: number;
  createdAt: Date;
};

/**
 * Purely reads owned learning state. It never calls a provider or writes a
 * recommendation, so dashboard refreshes and GET API requests are safe.
 */
export async function planNextLearningAction(
  userId: string,
  now = new Date(),
): Promise<LearningDecision> {
  const [intent, activeSession] = await Promise.all([
    getLearnerIntent(userId),
    prisma.learningSession.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, goal: true },
    }),
  ]);
  const base = { estimatedMinutes: intent.dailyMinutes, decisionVersion: "p11-v1" as const };

  if (activeSession) {
    return {
      ...base,
      kind: "RESUME",
      targetId: activeSession.id,
      reasonCode: "ACTIVE_SESSION",
      reasonVi: activeSession.goal
        ? `Bạn đang có một phiên chưa hoàn tất: ${activeSession.goal}`
        : "Bạn đang có một phiên AI chưa hoàn tất.",
      evidenceRefs: [],
      basis: { kind: "ACTIVE_SESSION", sessionId: activeSession.id },
    };
  }

  const [learningEvidence, adaptiveEvidence, memory, dueVocabulary, weakSkill, recentScenarioKeys] = await Promise.all([
    prisma.learningEvidence.findMany({
      where: { session: { userId } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_PLANNING_EVIDENCE,
      select: { id: true, skillKey: true, score: true, confidence: true, createdAt: true },
    }),
    prisma.adaptiveEvidence.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_PLANNING_EVIDENCE,
      select: { id: true, skillKey: true, score: true, confidence: true, createdAt: true },
    }),
    getLearnerMemory(userId),
    findDueVocabulary(userId, now),
    prisma.skillMastery.findFirst({
      where: { userId, evidenceCount: { gt: 0 }, masteryScore: { lt: 0.6 } },
      orderBy: [{ masteryScore: "asc" }, { lastUpdatedAt: "asc" }, { skillKey: "asc" }],
      select: { skillKey: true, masteryScore: true, evidenceCount: true },
    }),
    findRecentScenarioKeys(userId),
  ]);

  const observations = normalizeObservations(learningEvidence, adaptiveEvidence);
  const preferredTopics = intent.preferredTopics;
  const scenarioSelection = selectDailyQuestScenarioDetail({
    preferredTopics,
    recentScenarioKeys,
    seed: `${userId}:${dateKey(now)}:p11-v1`,
  });
  const scenarioKey = scenarioSelection.scenarioKey;

  if (!observations.length) {
    return {
      ...base,
      kind: "CALIBRATE",
      scenarioKey,
      goal: intent.goal ?? "Khởi động để hệ thống hiểu cách bạn đang dùng tiếng Anh.",
      reasonCode: "NO_EVIDENCE",
      reasonVi: "Hãy bắt đầu một nhiệm vụ ngắn để AI hiểu điểm xuất phát của bạn. Đây chưa phải đánh giá trình độ chính thức.",
      evidenceRefs: [],
      basis: { kind: "INSUFFICIENT_EVIDENCE" },
    };
  }

  // Plan21 SPEC-P212: fold stored spellings onto canonical families BEFORE the
  // threshold, so a mistake split across "tense" and "verb_tense" is counted
  // once and actually reaches 3.
  const recurringError = aggregateRecurringErrors(memory?.recurringErrors ?? [])
    .filter((item) => item.count >= 3)[0];
  if (recurringError) {
    const ownedReference = await prisma.learningEvidence.findFirst({
      where: { id: recurringError.lastEvidenceId, session: { userId } },
      select: { id: true },
    });
    if (ownedReference) {
      const refs: EvidenceRef[] = [{ source: "LEARNING", id: ownedReference.id }];
      return {
        ...base,
        kind: "PRACTICE",
        scenarioKey,
        goal: `Practice correcting ${recurringError.key} in short English answers.`,
        reasonCode: "RECURRING_ERROR",
        reasonVi: `Bạn đã lặp lại lỗi ${recurringError.labelVi.toLowerCase()} ${recurringError.count} lần gần đây. Hãy sửa lỗi trong một tình huống ngắn rồi thử lại.`,
        evidenceRefs: refs,
        basis: { kind: "EVIDENCE", skillKey: recurringError.key, refs },
      };
    }
  }

  if (dueVocabulary) {
    const dueAt = dueVocabulary.nextReviewAt ? dueVocabulary.nextReviewAt.toISOString() : now.toISOString();
    return {
      ...base,
      kind: "REVIEW",
      reasonCode: "DUE_REVIEW",
      reasonVi: `Từ “${dueVocabulary.vocabularyItem.displayText}” đã đến hạn ôn. Ôn ngắn trước để giữ nhịp nhớ.`,
      evidenceRefs: [],
      basis: {
        kind: "DUE_REVIEW",
        vocabularyItemId: dueVocabulary.vocabularyItemId,
        dueAt,
      },
    };
  }

  if (weakSkill) {
    // Causally filter evidence refs to only those that observed this exact skillKey
    const supportingSkillObservations = observations.filter(
      (obs) => obs.skillKey === weakSkill.skillKey
    );
    if (supportingSkillObservations.length > 0) {
      const refs = supportingSkillObservations.slice(0, MAX_EVIDENCE_REFS).map(toEvidenceRef);
      const lesson = await findCoachLesson(userId, weakSkill.skillKey);
      if (lesson) {
        return {
          ...base,
          kind: "COACH",
          targetId: lesson.id,
          reasonCode: "SKILL_PRACTICE",
          reasonVi: `AI có bằng chứng rằng bạn cần củng cố ${formatSkill(weakSkill.skillKey)}. Coach sẽ dùng bài “${lesson.title}” để luyện đúng điểm này.`,
          evidenceRefs: refs,
          basis: { kind: "EVIDENCE", skillKey: weakSkill.skillKey, refs },
        };
      }
      return {
        ...base,
        kind: "PRACTICE",
        scenarioKey,
        goal: `Practice ${formatSkill(weakSkill.skillKey)} in a short English situation.`,
        reasonCode: "SKILL_PRACTICE",
        reasonVi: `Bạn có một số bằng chứng cần củng cố ${formatSkill(weakSkill.skillKey)}. Hãy luyện lại trong tình huống ngắn trước khi đi tiếp.`,
        evidenceRefs: refs,
        basis: { kind: "EVIDENCE", skillKey: weakSkill.skillKey, refs },
      };
    }
  }

  if (isKnownScenarioKey(scenarioKey)) {
    const topicReason = scenarioSelection.preferenceInfluenced
      ? "Tình huống hôm nay ưu tiên một chủ đề bạn đã chọn."
      : "Tình huống hôm nay được chọn để bạn tiếp tục dùng tiếng Anh chủ động.";
    // The intent revision is an opaque hash (string) or null; it is recorded
    // verbatim so the basis can be matched against the learner's saved intent.
    const intentRevision = intent.revision ?? null;
    return {
      ...base,
      kind: "QUEST",
      scenarioKey,
      goal: intent.goal ?? undefined,
      reasonCode: "GOAL_PRACTICE",
      reasonVi: intent.goal
        ? `${topicReason} Mục tiêu bạn đã lưu: ${intent.goal}`
        : topicReason,
      evidenceRefs: [],
      basis: { kind: "DECLARED_GOAL", intentRevision },
    };
  }

  return {
    ...base,
    kind: "EMPTY",
    reasonCode: "NO_CONTENT",
    reasonVi: "Hiện chưa có nội dung phù hợp để bắt đầu nhiệm vụ tiếp theo.",
    evidenceRefs: [],
    basis: { kind: "INSUFFICIENT_EVIDENCE" },
  };
}

async function findDueVocabulary(userId: string, now: Date) {
  return prisma.vocabularyMastery.findFirst({
    where: {
      userId,
      nextReviewAt: { lte: now },
      vocabularyItem: { lessons: { some: { lesson: { status: "PUBLISHED" } } } },
    },
    orderBy: [{ nextReviewAt: "asc" }, { vocabularyItemId: "asc" }],
    select: {
      vocabularyItemId: true,
      nextReviewAt: true,
      vocabularyItem: { select: { displayText: true } },
    },
  });
}

async function findCoachLesson(userId: string, skillKey: string) {
  const profile = await prisma.learnerProfile.findUnique({
    where: { userId },
    select: { estimatedCefrLevel: true },
  });
  const relatedToSkill = skillLessonFilter(skillKey);
  if (!relatedToSkill) return null;
  return prisma.lesson.findFirst({
    where: {
      status: "PUBLISHED",
      ...(profile ? { cefrLevel: profile.estimatedCefrLevel } : {}),
      attempts: { none: { userId } },
      learningSessions: { none: { userId, mode: "LESSON_COACH", status: "COMPLETED" } },
      ...relatedToSkill,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true },
  });
}

async function findRecentScenarioKeys(userId: string) {
  const sessions = await prisma.learningSession.findMany({
    where: { userId, mode: { in: ["MISSION", "DAILY_QUEST"] }, status: { in: ["ACTIVE", "COMPLETED"] } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 10,
    select: { stateJson: true },
  });
  return sessions.flatMap(({ stateJson }) => {
    try {
      const value = JSON.parse(stateJson) as { scenarioKey?: unknown };
      return typeof value.scenarioKey === "string" && isKnownScenarioKey(value.scenarioKey)
        ? [value.scenarioKey]
        : [];
    } catch {
      return [];
    }
  });
}

function normalizeObservations(
  learning: Array<{ id: string; skillKey: string; score: number; confidence: number; createdAt: Date }>,
  adaptive: Array<{ id: string; skillKey: string; score: number; confidence: number; createdAt: Date }>,
): Observation[] {
  return [
    ...learning.map((item) => ({ ...item, source: "LEARNING" as const })),
    ...adaptive.map((item) => ({ ...item, source: "ADAPTIVE" as const })),
  ]
    .filter((item) => isFiniteScore(item.score) && isFiniteScore(item.confidence))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
}

function toEvidenceRef(observation: Observation): EvidenceRef {
  return { source: observation.source, id: observation.id };
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

function isFiniteScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** YYYY-MM-DD in `PLANNER_TIME_ZONE`. */
export function dateKey(value: Date) {
  return dayKeyFormatter.format(value);
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
