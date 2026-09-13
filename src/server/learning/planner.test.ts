import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  intent: vi.fn(),
  memory: vi.fn(),
  active: vi.fn(),
  sessions: vi.fn(),
  learningEvidence: vi.fn(),
  adaptiveEvidence: vi.fn(),
  referencedEvidence: vi.fn(),
  dueVocabulary: vi.fn(),
  weakSkill: vi.fn(),
  profile: vi.fn(),
  lesson: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/learner-intent", () => ({ getLearnerIntent: mocks.intent }));
vi.mock("@/server/learner-memory/repository", () => ({ getLearnerMemory: mocks.memory }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learningSession: { findFirst: mocks.active, findMany: mocks.sessions },
    learningEvidence: { findMany: mocks.learningEvidence, findFirst: mocks.referencedEvidence },
    adaptiveEvidence: { findMany: mocks.adaptiveEvidence },
    vocabularyMastery: { findFirst: mocks.dueVocabulary },
    skillMastery: { findFirst: mocks.weakSkill },
    learnerProfile: { findUnique: mocks.profile },
    lesson: { findFirst: mocks.lesson },
  },
}));

import { planNextLearningAction } from "./planner";

const userId = "learner-1";
const now = new Date("2026-09-13T07:00:00.000Z");
const evidence = [{ id: "learning-1", skillKey: "listening", score: 0.45, confidence: 0.9, createdAt: now }];

describe("planNextLearningAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.intent.mockResolvedValue({ goal: null, dailyMinutes: 10, preferredTopics: [], revision: "r1" });
    mocks.memory.mockResolvedValue(null);
    mocks.active.mockResolvedValue(null);
    mocks.sessions.mockResolvedValue([]);
    mocks.learningEvidence.mockResolvedValue(evidence);
    mocks.adaptiveEvidence.mockResolvedValue([]);
    mocks.referencedEvidence.mockResolvedValue(null);
    mocks.dueVocabulary.mockResolvedValue(null);
    mocks.weakSkill.mockResolvedValue(null);
    mocks.profile.mockResolvedValue({ estimatedCefrLevel: "A2" });
    mocks.lesson.mockResolvedValue(null);
  });

  it("resumes an owned active session before consulting evidence", async () => {
    mocks.active.mockResolvedValue({ id: "active-1", goal: "Order lunch" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "RESUME",
      targetId: "active-1",
      reasonCode: "ACTIVE_SESSION",
      evidenceRefs: [],
    });
    expect(mocks.learningEvidence).not.toHaveBeenCalled();
  });

  it("asks for calibration when neither owned learning nor adaptive evidence exists", async () => {
    mocks.learningEvidence.mockResolvedValue([]);
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "CALIBRATE",
      reasonCode: "NO_EVIDENCE",
      evidenceRefs: [],
    });
  });

  it("uses only a verified owned learning evidence reference for a recurring error", async () => {
    mocks.memory.mockResolvedValue({ recurringErrors: [{ errorType: "GRAMMAR", count: 3, lastEvidenceId: "old-evidence" }] });
    mocks.referencedEvidence.mockResolvedValue({ id: "old-evidence" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "PRACTICE",
      reasonCode: "RECURRING_ERROR",
      evidenceRefs: [{ source: "LEARNING", id: "old-evidence" }],
    });
  });

  it("puts due review before a previously observed weak skill", async () => {
    mocks.dueVocabulary.mockResolvedValue({ vocabularyItem: { displayText: "reservation" } });
    mocks.weakSkill.mockResolvedValue({ skillKey: "listening", masteryScore: 0.2, evidenceCount: 1 });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "REVIEW",
      reasonCode: "DUE_REVIEW",
    });
    expect(mocks.lesson).not.toHaveBeenCalled();
  });

  it("uses adaptive evidence as owned planner context without converting it to a learning evidence ID", async () => {
    mocks.learningEvidence.mockResolvedValue([]);
    mocks.adaptiveEvidence.mockResolvedValue([{ id: "adaptive-1", skillKey: "vocabulary", score: 0.8, confidence: 1, createdAt: now }]);
    mocks.intent.mockResolvedValue({ goal: "Travel confidently", dailyMinutes: 15, preferredTopics: ["travel"], revision: "r1" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "QUEST",
      reasonCode: "GOAL_PRACTICE",
      evidenceRefs: [{ source: "ADAPTIVE", id: "adaptive-1" }],
      estimatedMinutes: 15,
    });
  });

  it("does not claim a saved topic influenced a Quest when no authored scenario matches it", async () => {
    mocks.intent.mockResolvedValue({
      goal: null,
      dailyMinutes: 10,
      preferredTopics: ["astronomy"],
      revision: "r1",
    });

    const decision = await planNextLearningAction(userId, now);

    expect(decision).toMatchObject({ kind: "QUEST", reasonCode: "GOAL_PRACTICE" });
    expect(decision.reasonVi).not.toContain("ưu tiên một chủ đề bạn đã chọn");
  });

  it("chooses a published Coach lesson only for an observed weak skill", async () => {
    mocks.weakSkill.mockResolvedValue({ skillKey: "listening", masteryScore: 0.2, evidenceCount: 1 });
    mocks.lesson.mockResolvedValue({ id: "lesson-1", title: "Listen at work" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "COACH",
      targetId: "lesson-1",
      reasonCode: "SKILL_PRACTICE",
    });
    expect(mocks.weakSkill).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ evidenceCount: { gt: 0 } }),
      orderBy: [
        { masteryScore: "asc" },
        { lastUpdatedAt: "asc" },
        { skillKey: "asc" },
      ],
    }));
  });
});
