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

import { PLANNER_TIME_ZONE, dateKey, planNextLearningAction } from "./planner";

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

  it("counts one mistake once, however the model spelled it", async () => {
    // Plan21: before canonicalisation these were two entries of 2, each below
    // the threshold of 3, so a learner who had made the same tense mistake four
    // times was never sent to practise it.
    mocks.memory.mockResolvedValue({ recurringErrors: [
      { errorType: "tense", count: 2, lastEvidenceId: "old-evidence" },
      { errorType: "verb_tense", count: 2, lastEvidenceId: "old-evidence" },
    ] });
    mocks.referencedEvidence.mockResolvedValue({ id: "old-evidence" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "PRACTICE",
      reasonCode: "RECURRING_ERROR",
    });
  });

  it("names the mistake in Vietnamese, never in the model's English", async () => {
    mocks.memory.mockResolvedValue({ recurringErrors: [{ errorType: "verb_tense", count: 4, lastEvidenceId: "old-evidence" }] });
    mocks.referencedEvidence.mockResolvedValue({ id: "old-evidence" });
    const decision = await planNextLearningAction(userId, now);
    expect(decision.reasonVi).toContain("thì của động từ");
    expect(decision.reasonVi).not.toContain("verb_tense");
    expect(decision.reasonVi).not.toContain("tense");
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
    mocks.adaptiveEvidence.mockResolvedValue([{ id: "adaptive-1", skillKey: "vocabulary", score: 0.3, confidence: 1, createdAt: now }]);
    mocks.weakSkill.mockResolvedValue({ skillKey: "vocabulary", masteryScore: 0.3, evidenceCount: 1 });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "PRACTICE",
      reasonCode: "SKILL_PRACTICE",
      evidenceRefs: [{ source: "ADAPTIVE", id: "adaptive-1" }],
      basis: {
        kind: "EVIDENCE",
        skillKey: "vocabulary",
        refs: [{ source: "ADAPTIVE", id: "adaptive-1" }],
      },
      decisionVersion: "p11-v1",
    });
  });

  it("does not claim listening evidence when learner has weak listening skill but only vocabulary observations", async () => {
    mocks.weakSkill.mockResolvedValue({ skillKey: "listening", masteryScore: 0.2, evidenceCount: 1 });
    mocks.learningEvidence.mockResolvedValue([
      { id: "vocab-1", skillKey: "vocabulary", score: 0.5, confidence: 1, createdAt: now },
    ]);
    mocks.intent.mockResolvedValue({ goal: "Build vocabulary", dailyMinutes: 10, preferredTopics: [], revision: "r1" });

    const decision = await planNextLearningAction(userId, now);

    // Causal invariant: no matching listening observations -> does NOT claim listening
    expect(decision.kind).toBe("QUEST");
    expect(decision.reasonCode).toBe("GOAL_PRACTICE");
    expect(decision.evidenceRefs).toEqual([]);
    expect(decision.basis).toEqual({ kind: "DECLARED_GOAL", intentRevision: "r1" });
    expect(decision.reasonVi).not.toContain("nghe");
  });

  it("enforces causal basis match: 100% cited refs match the weak skill with 0 foreign skill refs", async () => {
    mocks.weakSkill.mockResolvedValue({ skillKey: "listening", masteryScore: 0.3, evidenceCount: 2 });
    const t1 = new Date("2026-09-13T07:00:00.000Z");
    const t2 = new Date("2026-09-13T07:01:00.000Z");
    mocks.learningEvidence.mockResolvedValue([
      { id: "listen-1", skillKey: "listening", score: 0.3, confidence: 0.9, createdAt: t1 },
      { id: "vocab-1", skillKey: "vocabulary", score: 0.8, confidence: 0.9, createdAt: t2 },
      { id: "listen-2", skillKey: "listening", score: 0.4, confidence: 0.8, createdAt: t2 },
    ]);

    const decision = await planNextLearningAction(userId, now);

    expect(decision.kind).toBe("PRACTICE");
    expect(decision.evidenceRefs).toHaveLength(2);
    expect(decision.evidenceRefs).toEqual([
      { source: "LEARNING", id: "listen-2" },
      { source: "LEARNING", id: "listen-1" },
    ]);
    expect(decision.basis).toEqual({
      kind: "EVIDENCE",
      skillKey: "listening",
      refs: [
        { source: "LEARNING", id: "listen-2" },
        { source: "LEARNING", id: "listen-1" },
      ],
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
      decisionVersion: "p11-v1",
      basis: {
        kind: "EVIDENCE",
        skillKey: "listening",
        refs: [{ source: "LEARNING", id: "learning-1" }],
      },
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

describe("planner day key and intent revision (Plan13 P132 \u00a77)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("records the intent revision hash verbatim and null when the learner has no saved intent", async () => {
    mocks.intent.mockResolvedValue({ goal: "Order food", dailyMinutes: 10, preferredTopics: [], revision: "sha-abc" });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "QUEST",
      basis: { kind: "DECLARED_GOAL", intentRevision: "sha-abc" },
    });

    mocks.intent.mockResolvedValue({ goal: null, dailyMinutes: 10, preferredTopics: [], revision: null });
    await expect(planNextLearningAction(userId, now)).resolves.toMatchObject({
      kind: "QUEST",
      basis: { kind: "DECLARED_GOAL", intentRevision: null },
    });
  });

  it("rolls the Daily Quest day over at midnight Asia/Ho_Chi_Minh, not at UTC midnight (07:00 local)", () => {
    expect(PLANNER_TIME_ZONE).toBe("Asia/Ho_Chi_Minh");
    // 16:59Z = 23:59 in Viet Nam -> still the 13th
    expect(dateKey(new Date("2026-09-13T16:59:00.000Z"))).toBe("2026-09-13");
    // 17:00Z = 00:00 in Viet Nam -> already the 14th (UTC would still say 13)
    expect(dateKey(new Date("2026-09-13T17:00:00.000Z"))).toBe("2026-09-14");
    // 23:30Z on the 13th is 06:30 on the 14th in Viet Nam
    expect(dateKey(new Date("2026-09-13T23:30:00.000Z"))).toBe("2026-09-14");
  });
});


// Plan13 SPEC-P131 §3: the planner only ever resumes an ACTIVE session.
describe("planner and abandoned sessions", () => {
  it("queries only ACTIVE sessions for RESUME so an ABANDONED session is never resumed", async () => {
    mocks.active.mockResolvedValue(null);
    const decision = await planNextLearningAction(userId, now);
    expect(decision.kind).not.toBe("RESUME");
    expect(mocks.active).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId, status: "ACTIVE" },
    }));
  });
});
