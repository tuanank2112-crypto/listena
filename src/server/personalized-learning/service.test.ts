import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueLesson: vi.fn(),
  findFirstLesson: vi.fn(),
  findManyLessons: vi.fn(),
  updateLesson: vi.fn(),
  updateManyLesson: vi.fn(),
  findUniqueAttempt: vi.fn(),
  profile: vi.fn(),
  skills: vi.fn(),
  dueVocabulary: vi.fn(),
  curriculumVocabulary: vi.fn(),
  evidence: vi.fn(),
  interactions: vi.fn(),
  provider: vi.fn(),
  generateJson: vi.fn(),
  executeAtomicBatch: vi.fn(),
  reserveAICall: vi.fn(),
  settleAICall: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    personalizedLesson: {
      findUnique: mocks.findUniqueLesson,
      findFirst: mocks.findFirstLesson,
      findMany: mocks.findManyLessons,
      update: mocks.updateLesson,
      updateMany: mocks.updateManyLesson,
    },
    learnerProfile: { findUnique: mocks.profile },
    skillMastery: { findMany: mocks.skills },
    vocabularyMastery: { findMany: mocks.dueVocabulary },
    lessonVocabulary: { findMany: mocks.curriculumVocabulary },
    adaptiveEvidence: { findMany: mocks.evidence },
    personalizedLessonAttempt: { findUnique: mocks.findUniqueAttempt },
    aIInteraction: { findMany: mocks.interactions },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  libSqlBoolean: (value: boolean) => (value ? 1 : 0),
  libSqlTimestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  executeAtomicLibSqlBatch: mocks.executeAtomicBatch,
}));
vi.mock("@/server/ai/openai-responses-provider", () => ({
  createConfiguredStructuredAIProvider: mocks.provider,
}));
vi.mock("@/server/ai/request-budget", () => ({
  reserveUserAICall: mocks.reserveAICall,
  settleUserAICall: mocks.settleAICall,
}));

import {
  getOwnedPersonalizedLesson,
  PersonalizedLearningError,
  provisionPersonalizedLesson,
  submitPersonalizedLessonAttempt,
} from "./service";

const publicContent = {
  introVi: "Bài này tập trung vào từ vựng bạn cần ôn.",
  transcript: "Mai checks a timetable before she buys a ticket for her trip.",
  vocabulary: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      lemma: "timetable",
      displayText: "timetable",
      meaningVi: "thời gian biểu",
      cefrLevel: "A2",
      isTarget: true,
      importance: 1,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      lemma: "ticket",
      displayText: "ticket",
      meaningVi: "vé",
      cefrLevel: "A2",
      isTarget: true,
      importance: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      lemma: "trip",
      displayText: "trip",
      meaningVi: "chuyến đi",
      cefrLevel: "A2",
      isTarget: true,
      importance: 1,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      lemma: "book",
      displayText: "book",
      meaningVi: "đặt chỗ",
      cefrLevel: "A2",
      isTarget: true,
      importance: 1,
    },
  ],
  exercises: [
    {
      id: "exercise-1",
      type: "CHOICE",
      prompt: "Choose ticket",
      options: ["ticket", "trip"],
    },
    { id: "exercise-2", type: "SPELL", prompt: "Spell trip" },
    { id: "exercise-3", type: "FILL", prompt: "Fill book" },
    {
      id: "exercise-4",
      type: "CHOICE",
      prompt: "Choose timetable",
      options: ["timetable", "ticket"],
    },
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
    objectivesJson: JSON.stringify([
      "Use ticket and timetable",
      "Spell trip words",
    ]),
    contentJson: JSON.stringify(publicContent),
    validatorJson: JSON.stringify({ exercises: [] }),
    sourceSnapshotHash: "snapshot",
    generationKey: "vocabulary:snapshot",
    promptVersion: "test",
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    readyAt: new Date("2026-09-10T00:01:00.000Z"),
  };
}

function generatingLesson() {
  return {
    ...readyLesson(),
    status: "GENERATING",
    title: null,
    objectivesJson: "[]",
    contentJson: null,
    validatorJson: null,
    readyAt: null,
  };
}

function generatedDraft() {
  return {
    title: "Travel words tailored for you",
    targetSkill: "vocabulary",
    cefrLevel: "A2",
    difficulty: 1,
    objectives: ["Use travel words in context", "Spell essential travel words"],
    introVi: "Luyện từ vựng du lịch theo mức độ hiện tại của bạn.",
    transcript:
      "Mai checks a timetable before buying a ticket for her weekend trip.",
    vocabulary: [
      {
        lemma: "timetable",
        displayText: "timetable",
        meaningVi: "thời gian biểu",
        cefrLevel: "A2",
        isTarget: true,
        importance: 1,
      },
      {
        lemma: "ticket",
        displayText: "ticket",
        meaningVi: "vé",
        cefrLevel: "A2",
        isTarget: true,
        importance: 1,
      },
      {
        lemma: "trip",
        displayText: "trip",
        meaningVi: "chuyến đi",
        cefrLevel: "A2",
        isTarget: true,
        importance: 1,
      },
      {
        lemma: "book",
        displayText: "book",
        meaningVi: "đặt chỗ",
        cefrLevel: "A2",
        isTarget: true,
        importance: 1,
      },
    ],
    exercises: [
      {
        id: "exercise-1",
        type: "CHOICE",
        prompt: "Choose the word for a travel pass.",
        options: ["ticket", "trip"],
        answer: "ticket",
        feedbackVi: "Ticket là vé đi lại.",
      },
      {
        id: "exercise-2",
        type: "SPELL",
        prompt: "Spell the word for a journey.",
        answer: "trip",
        feedbackVi: "Trip là chuyến đi.",
      },
      {
        id: "exercise-3",
        type: "FILL",
        prompt: "Fill in: Please ___ a room.",
        answer: "book",
        feedbackVi: "Book là đặt chỗ.",
      },
      {
        id: "exercise-4",
        type: "CHOICE",
        prompt: "Choose the schedule word.",
        options: ["timetable", "ticket"],
        answer: "timetable",
        feedbackVi: "Timetable là thời gian biểu.",
      },
    ],
  };
}

function readyAttemptLesson() {
  return {
    ...readyLesson(),
    validatorJson: JSON.stringify({
      exercises: [
        {
          id: "exercise-1",
          acceptedAnswers: ["ticket"],
          feedbackVi: "Ticket là vé đi lại.",
        },
        {
          id: "exercise-2",
          acceptedAnswers: ["trip"],
          feedbackVi: "Trip là chuyến đi.",
        },
        {
          id: "exercise-3",
          acceptedAnswers: ["book"],
          feedbackVi: "Book là đặt chỗ.",
        },
        {
          id: "exercise-4",
          acceptedAnswers: ["timetable"],
          feedbackVi: "Timetable là thời gian biểu.",
        },
      ],
    }),
  };
}

describe("personalized lesson ownership and reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveAICall.mockResolvedValue({
      id: "reservation-1",
      userId: "learner-1",
      purpose: "personalized_lesson",
    });
    mocks.settleAICall.mockResolvedValue(undefined);
    mocks.profile.mockResolvedValue({
      estimatedCefrLevel: "A2",
      calibrationStatus: "UNASSESSED",
      preferredTopics: "travel, food",
    });
    mocks.skills.mockResolvedValue([
      { skillKey: "vocabulary", masteryScore: 0.35 },
    ]);
    mocks.dueVocabulary.mockResolvedValue([]);
    mocks.curriculumVocabulary.mockResolvedValue([]);
    mocks.evidence.mockResolvedValue([]);
    mocks.interactions.mockResolvedValue([]);
    mocks.updateLesson.mockImplementation(
      async (args: { data?: Record<string, unknown> }) => ({
        ...generatingLesson(),
        ...(args.data ?? {}),
      }),
    );
    mocks.updateManyLesson.mockResolvedValue({ count: 1 });
  });

  it("keeps the owner predicate when reading a private artifact", async () => {
    mocks.findFirstLesson.mockResolvedValue(null);

    await expect(
      getOwnedPersonalizedLesson(
        "other-learner",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_NOT_FOUND", status: 404 });

    expect(mocks.findFirstLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          userId: "other-learner",
          status: "READY",
        }),
      }),
    );
  });

  it("reuses a matching READY artifact without calling the live provider", async () => {
    mocks.findUniqueLesson.mockResolvedValue(readyLesson());

    const result = await provisionPersonalizedLesson("learner-1", "vocabulary");

    expect(result.reused).toBe(true);
    expect(result.lesson.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("does not turn a missing private record into a distinguishable foreign-record error", () => {
    const error = new PersonalizedLearningError(
      "PRIVATE_NOT_FOUND",
      404,
      "Không tìm thấy bài học riêng tư này.",
    );
    expect(error.code).toBe("PRIVATE_NOT_FOUND");
  });

  it("uses one fenced atomic libSQL batch for the validated lesson and provenance", async () => {
    mocks.findUniqueLesson
      .mockResolvedValueOnce(generatingLesson())
      .mockResolvedValueOnce(readyLesson());
    mocks.findFirstLesson.mockResolvedValue(null);
    mocks.provider.mockReturnValue({
      providerName: "kira",
      modelName: "glm-5.3-flash-free",
      generateJson: mocks.generateJson,
    });
    mocks.generateJson.mockResolvedValue({
      output: generatedDraft(),
      provider: "kira",
      model: "glm-5.3-flash-free",
      requestId: "request-1",
    });
    mocks.executeAtomicBatch.mockImplementation(
      async (statements: Array<{ sql: string }>) =>
        statements.map((statement) => ({
          changes:
              statement.sql.includes("SET \"status\" = 'READY'") ||
              statement.sql.includes('SET "failureCode" = NULL')
                ? 1
                : 0,
        })),
    );

    const result = await provisionPersonalizedLesson("learner-1", "vocabulary");

    expect(result.reused).toBe(false);
    expect(mocks.reserveAICall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "learner-1",
        purpose: "personalized_lesson",
        provider: "kira",
        model: "glm-5.3-flash-free",
      }),
    );
    expect(mocks.settleAICall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: true,
        provider: "kira",
        model: "glm-5.3-flash-free",
      }),
    );
    const statements = mocks.executeAtomicBatch.mock.calls[0]![0] as Array<{
      sql: string;
    }>;
    expect(
      statements.some((statement) =>
        statement.sql.includes('UPDATE "PersonalizedLesson"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.sql.includes('INSERT INTO "AIInteraction"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.sql.includes('INSERT INTO "PersonalizedLessonVocabulary"'),
      ),
    ).toBe(true);
    expect(
      statements.find((statement) =>
        statement.sql.includes('UPDATE "PersonalizedLesson"'),
      )?.sql,
    ).toContain("json_set");
  });

  it("settles the reservation as failed when the provider call rejects", async () => {
    mocks.findUniqueLesson.mockResolvedValue(generatingLesson());
    mocks.findFirstLesson.mockResolvedValue(null);
    mocks.provider.mockReturnValue({
      providerName: "kira",
      modelName: "glm-5.3-flash-free",
      generateJson: mocks.generateJson,
    });
    mocks.generateJson.mockRejectedValue(new Error("upstream unavailable"));

    await expect(
      provisionPersonalizedLesson("learner-1", "vocabulary"),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });

    expect(mocks.settleAICall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: false,
        provider: "kira",
        model: "glm-5.3-flash-free",
        failureReason: "unknown",
      }),
    );
  });

  it("atomically gates the libSQL attempt, evidence, mastery and calibration writes", async () => {
    mocks.findFirstLesson.mockResolvedValue(readyAttemptLesson());
    mocks.findUniqueAttempt.mockResolvedValue(null);
    mocks.executeAtomicBatch.mockImplementation(
      async (statements: Array<unknown>) =>
        statements.map(() => ({ changes: 1 })),
    );

    const result = await submitPersonalizedLessonAttempt({
      userId: "learner-1",
      lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exerciseId: "exercise-1",
      answer: "ticket",
      clientAttemptId: "client-attempt-1",
      responseTimeMs: 800,
    });

    expect(result.attempt).toMatchObject({
      score: 1,
      correct: true,
      idempotent: false,
    });
    const statements = mocks.executeAtomicBatch.mock.calls[0]![0] as Array<{
      sql: string;
    }>;
    expect(statements[0]?.sql).toContain(
      'INSERT INTO "PersonalizedLessonAttempt"',
    );
    expect(
      statements.some((statement) =>
        statement.sql.includes('INSERT INTO "AdaptiveEvidence"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.sql.includes('UPDATE "SkillMastery"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.sql.includes('WITH "recentEvidence"'),
      ),
    ).toBe(true);
  });

  it("returns the original attempt when an atomic conditional insert loses the client ID race", async () => {
    mocks.findFirstLesson.mockResolvedValue(readyAttemptLesson());
    mocks.findUniqueAttempt.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "existing-attempt",
      score: 0,
      correct: false,
      feedbackVi: "Hãy thử lại.",
    });
    mocks.executeAtomicBatch.mockImplementation(
      async (statements: Array<unknown>) =>
        statements.map(() => ({ changes: 0 })),
    );

    const result = await submitPersonalizedLessonAttempt({
      userId: "learner-1",
      lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exerciseId: "exercise-1",
      answer: "ticket",
      clientAttemptId: "client-attempt-race",
    });

    expect(result.attempt).toEqual({
      id: "existing-attempt",
      score: 0,
      correct: false,
      feedbackVi: "Hãy thử lại.",
      idempotent: true,
    });
    const statements = mocks.executeAtomicBatch.mock.calls[0]![0] as Array<{
      sql: string;
    }>;
    expect(statements[0]?.sql).toContain(
      'ON CONFLICT("lessonId", "clientAttemptId") DO NOTHING',
    );
  });
});
