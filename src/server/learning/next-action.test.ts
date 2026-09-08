import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEvidence: vi.fn(),
  findReferencedEvidence: vi.fn(),
  findWeakSkill: vi.fn(),
  findProfile: vi.fn(),
  findLesson: vi.fn(),
  findDueVocabulary: vi.fn(),
  findSession: vi.fn(),
  getMemory: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learningEvidence: { findMany: mocks.findEvidence, findFirst: mocks.findReferencedEvidence },
    skillMastery: { findFirst: mocks.findWeakSkill },
    learnerProfile: { findUnique: mocks.findProfile },
    lesson: { findFirst: mocks.findLesson },
    vocabularyMastery: { findFirst: mocks.findDueVocabulary },
    learningSession: { findFirst: mocks.findSession },
  },
}));
vi.mock("@/server/learner-memory/repository", () => ({ getLearnerMemory: mocks.getMemory }));

import { computeNextAction } from "./next-action";

const userId = "learner-1";
const sessionId = "session-1";
const evidence = [{ id: "evidence-current", skillKey: "listening", score: 0.45 }];

describe("computeNextAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findEvidence.mockResolvedValue(evidence);
    mocks.findReferencedEvidence.mockResolvedValue(null);
    mocks.findWeakSkill.mockResolvedValue(null);
    mocks.findProfile.mockResolvedValue({ estimatedCefrLevel: "A2" });
    mocks.findLesson.mockResolvedValue(null);
    mocks.findDueVocabulary.mockResolvedValue(null);
    mocks.findSession.mockResolvedValue({ stateJson: JSON.stringify({ scenarioKey: "cafe-order" }) });
    mocks.getMemory.mockResolvedValue(null);
  });

  it("returns null when the completed session has no owned evidence", async () => {
    mocks.findEvidence.mockResolvedValue([]);

    await expect(computeNextAction(userId, sessionId)).resolves.toBeNull();
    expect(mocks.getMemory).not.toHaveBeenCalled();
    expect(mocks.findEvidence).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sessionId, session: { userId } }),
    }));
  });

  it("uses a recurring error only after its referenced evidence is owned, even across sessions", async () => {
    mocks.getMemory.mockResolvedValue({
      recurringErrors: [{ errorType: "GRAMMAR", count: 3, lastEvidenceId: "evidence-earlier" }],
    });
    mocks.findReferencedEvidence.mockResolvedValue({ id: "evidence-earlier" });

    await expect(computeNextAction(userId, sessionId)).resolves.toMatchObject({
      kind: "PRACTICE",
      scenarioKey: "lost-luggage",
      evidenceRefs: ["evidence-earlier"],
    });
    expect(mocks.findReferencedEvidence).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "evidence-earlier", session: { userId } },
    }));
  });

  it("does not use a foreign memory evidence reference for a corrective action", async () => {
    mocks.getMemory.mockResolvedValue({
      recurringErrors: [{ errorType: "GRAMMAR", count: 5, lastEvidenceId: "evidence-foreign" }],
    });

    await expect(computeNextAction(userId, sessionId)).resolves.toMatchObject({
      kind: "MISSION",
      scenarioKey: "lost-luggage",
      evidenceRefs: ["evidence-current"],
    });
    expect(mocks.findReferencedEvidence).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "evidence-foreign", session: { userId } },
    }));
  });

  it("recommends only a published, unlearned Coach lesson that matches the weak skill and level", async () => {
    mocks.findWeakSkill.mockResolvedValue({ skillKey: "listening", masteryScore: 0.4 });
    mocks.findLesson.mockResolvedValue({ id: "lesson-listening", title: "Listening in context" });

    await expect(computeNextAction(userId, sessionId)).resolves.toMatchObject({
      kind: "COACH",
      targetId: "lesson-listening",
      evidenceRefs: ["evidence-current"],
    });
    expect(mocks.findLesson).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "PUBLISHED",
        cefrLevel: "A2",
        attempts: { none: { userId } },
        learningSessions: { none: { userId, mode: "LESSON_COACH", status: "COMPLETED" } },
      }),
    }));
  });

  it("falls back to corrective practice when a weak skill has no valid Coach target", async () => {
    mocks.findWeakSkill.mockResolvedValue({ skillKey: "grammar", masteryScore: 0.35 });

    await expect(computeNextAction(userId, sessionId)).resolves.toMatchObject({
      kind: "PRACTICE",
      scenarioKey: "lost-luggage",
      evidenceRefs: ["evidence-current"],
    });
  });

  it("uses the actual due vocabulary and its published lesson as the Quest target", async () => {
    mocks.findDueVocabulary.mockResolvedValue({
      vocabularyItem: {
        displayText: "reservation",
        lessons: [{ lessonId: "lesson-hotel", lesson: { title: "Checking in" } }],
      },
    });

    await expect(computeNextAction(userId, sessionId)).resolves.toMatchObject({
      kind: "QUEST",
      targetId: "lesson-hotel",
      reason: expect.stringContaining("reservation"),
    });
    expect(mocks.findDueVocabulary).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ nextReviewAt: "asc" }, { vocabularyItemId: "asc" }],
    }));
  });

  it("rotates to a different authored Mission and grounds its reason in current evidence", async () => {
    const action = await computeNextAction(userId, sessionId);

    expect(action).toMatchObject({
      kind: "MISSION",
      scenarioKey: "lost-luggage",
      evidenceRefs: ["evidence-current"],
    });
    expect(action?.reason).toContain("nghe");
    expect(action?.reason).toContain("45%");
  });
});
