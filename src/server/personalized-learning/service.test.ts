import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueLesson: vi.fn(),
  findFirstLesson: vi.fn(),
  findManyLessons: vi.fn(),
  profile: vi.fn(),
  skills: vi.fn(),
  dueVocabulary: vi.fn(),
  curriculumVocabulary: vi.fn(),
  evidence: vi.fn(),
  provider: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    personalizedLesson: {
      findUnique: mocks.findUniqueLesson,
      findFirst: mocks.findFirstLesson,
      findMany: mocks.findManyLessons,
    },
    learnerProfile: { findUnique: mocks.profile },
    skillMastery: { findMany: mocks.skills },
    vocabularyMastery: { findMany: mocks.dueVocabulary },
    lessonVocabulary: { findMany: mocks.curriculumVocabulary },
    adaptiveEvidence: { findMany: mocks.evidence },
  },
}));
vi.mock("@/server/ai/openai-responses-provider", () => ({
  createConfiguredOpenAIResponsesProvider: mocks.provider,
}));

import {
  getOwnedPersonalizedLesson,
  PersonalizedLearningError,
  provisionPersonalizedLesson,
} from "./service";

const publicContent = {
  introVi: "Bài này tập trung vào từ vựng bạn cần ôn.",
  transcript: "Mai checks a timetable before she buys a ticket for her trip.",
  vocabulary: [
    { id: "11111111-1111-4111-8111-111111111111", lemma: "timetable", displayText: "timetable", meaningVi: "thời gian biểu", cefrLevel: "A2", isTarget: true, importance: 1 },
    { id: "22222222-2222-4222-8222-222222222222", lemma: "ticket", displayText: "ticket", meaningVi: "vé", cefrLevel: "A2", isTarget: true, importance: 1 },
    { id: "33333333-3333-4333-8333-333333333333", lemma: "trip", displayText: "trip", meaningVi: "chuyến đi", cefrLevel: "A2", isTarget: true, importance: 1 },
    { id: "44444444-4444-4444-8444-444444444444", lemma: "book", displayText: "book", meaningVi: "đặt chỗ", cefrLevel: "A2", isTarget: true, importance: 1 },
  ],
  exercises: [
    { id: "exercise-1", type: "CHOICE", prompt: "Choose ticket", options: ["ticket", "trip"] },
    { id: "exercise-2", type: "SPELL", prompt: "Spell trip" },
    { id: "exercise-3", type: "FILL", prompt: "Fill book" },
    { id: "exercise-4", type: "CHOICE", prompt: "Choose timetable", options: ["timetable", "ticket"] },
  ],
};

function readyLesson() {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: "learner-1",
    status: "READY",
    targetSkill: "vocabulary",
    cefrLevel: "A2",
    difficulty: 1,
    title: "Travel words for you",
    objectivesJson: JSON.stringify(["Use ticket and timetable", "Spell trip words"]),
    contentJson: JSON.stringify(publicContent),
    validatorJson: JSON.stringify({ exercises: [] }),
    sourceSnapshotHash: "snapshot",
    generationKey: "vocabulary:snapshot",
    promptVersion: "test",
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    readyAt: new Date("2026-09-10T00:01:00.000Z"),
  };
}

describe("personalized lesson ownership and reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({
      estimatedCefrLevel: "A2",
      calibrationStatus: "UNASSESSED",
      preferredTopics: "travel, food",
    });
    mocks.skills.mockResolvedValue([{ skillKey: "vocabulary", masteryScore: 0.35 }]);
    mocks.dueVocabulary.mockResolvedValue([]);
    mocks.curriculumVocabulary.mockResolvedValue([]);
    mocks.evidence.mockResolvedValue([]);
  });

  it("keeps the owner predicate when reading a private artifact", async () => {
    mocks.findFirstLesson.mockResolvedValue(null);

    await expect(getOwnedPersonalizedLesson("other-learner", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
      .rejects.toMatchObject({ code: "PRIVATE_NOT_FOUND", status: 404 });

    expect(mocks.findFirstLesson).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        userId: "other-learner",
        status: "READY",
      }),
    }));
  });

  it("reuses a matching READY artifact without calling the live provider", async () => {
    mocks.findUniqueLesson.mockResolvedValue(readyLesson());

    const result = await provisionPersonalizedLesson("learner-1", "vocabulary");

    expect(result.reused).toBe(true);
    expect(result.lesson.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("does not turn a missing private record into a distinguishable foreign-record error", () => {
    const error = new PersonalizedLearningError("PRIVATE_NOT_FOUND", 404, "Không tìm thấy bài học riêng tư này.");
    expect(error.code).toBe("PRIVATE_NOT_FOUND");
  });
});
