import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIRequestBudgetError, AIUnavailableError } from "@/server/ai/errors";

const mocks = vi.hoisted(() => ({
  findUniqueLesson: vi.fn(),
  findFirstLesson: vi.fn(),
  findManyLessons: vi.fn(),
  updateLesson: vi.fn(),
  updateManyLesson: vi.fn(),
  findUniqueAttempt: vi.fn(),
  findFirstAttempt: vi.fn(),
  createLesson: vi.fn(),
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
      create: mocks.createLesson,
    },
    learnerProfile: { findUnique: mocks.profile },
    skillMastery: { findMany: mocks.skills },
    vocabularyMastery: { findMany: mocks.dueVocabulary },
    lessonVocabulary: { findMany: mocks.curriculumVocabulary },
    adaptiveEvidence: { findMany: mocks.evidence },
    personalizedLessonAttempt: { findUnique: mocks.findUniqueAttempt, findFirst: mocks.findFirstAttempt },
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
  claimPersonalizedLessonGeneration,
  getOwnedPersonalizedLesson,
  getOwnedPersonalizedLessonStatus,
  masteryPerformance,
  PersonalizedLearningError,
  runPersonalizedLessonGeneration,
  submitPersonalizedLessonAttempt,
  type PersonalizedGenerationClaim,
} from "./service";
import { PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS } from "./contracts";

/** Plan13: claim then run, the way the route does it (claim -> 202 -> after()). */
async function provisionPersonalizedLesson(userId: string, skill?: "vocabulary") {
  const claim = await claimPersonalizedLessonGeneration(userId, skill);
  if (claim.kind === "ready") return { lesson: claim.lesson, reused: true, claim };
  if (claim.kind !== "claimed") throw new Error(`unexpected claim ${claim.kind}`);
  const result = await runPersonalizedLessonGeneration(claim);
  if (result.status === "FAILED") {
    throw Object.assign(new Error("generation failed"), { code: result.failureCode });
  }
  return { lesson: result.lesson, reused: false, claim };
}

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
    mocks.findFirstAttempt.mockResolvedValue(null);
    mocks.createLesson.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
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
      providerName: "vyce",
      modelName: "claude-sonnet-4-6",
      generateJson: mocks.generateJson,
    });
    mocks.generateJson.mockResolvedValue({
      output: generatedDraft(),
      provider: "vyce",
      model: "claude-sonnet-4-6",
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
    // Compact contract (Plan13 SPEC-P131 §4): 1,400 output tokens, 4 exercises, 4-5 words.
    expect(mocks.generateJson).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS,
      input: expect.objectContaining({
        constraints: expect.objectContaining({ exerciseCount: "exactly 4", vocabularyCount: "4 to 5", transcriptMaxChars: 700 }),
      }),
    }));
    expect(PERSONALIZED_LESSON_MAX_OUTPUT_TOKENS).toBe(1_400);
    expect(mocks.reserveAICall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "learner-1",
        purpose: "personalized_lesson",
        provider: "vyce",
        model: "claude-sonnet-4-6",
      }),
    );
    expect(mocks.settleAICall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: true,
        provider: "vyce",
        model: "claude-sonnet-4-6",
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
      providerName: "vyce",
      modelName: "claude-sonnet-4-6",
      generateJson: mocks.generateJson,
    });
    mocks.generateJson.mockRejectedValue(new Error("upstream unavailable"));

    await expect(
      provisionPersonalizedLesson("learner-1", "vocabulary"),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });

    // The row is marked FAILED under its generation key so the client poll ends.
    expect(mocks.updateManyLesson).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "GENERATING" }),
      data: { status: "FAILED", failureCode: "AI_UNAVAILABLE" },
    }));
    expect(mocks.settleAICall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: false,
        provider: "vyce",
        model: "claude-sonnet-4-6",
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
    // SPEC-P132 §8 mirror: new = old + 0.2 * (performance - old), never 0.8*old + contribution.
    const mastery = statements.find((statement) => statement.sql.includes('UPDATE "SkillMastery"'))!;
    expect(mastery.sql).toContain('"masteryScore" + (? - "masteryScore") * ?');
    expect((mastery as { values?: unknown[] }).values?.slice(2, 4)).toEqual([masteryPerformance(1, 1), 0.2]);
    expect(masteryPerformance(1, 0.5)).toBe(1);
    expect(masteryPerformance(0.5, 2)).toBeCloseTo(0.5 / 1.8);
    // PL2: the insert refuses a second graded attempt for the same exercise.
    expect(statements[0]?.sql).toContain('"exerciseId" = ? AND "userId" = ?');
  });

  it("persists Answer Canvas hintCount/confidence/assistMode on the attempt insert and defaults them", async () => {
    mocks.findFirstLesson.mockResolvedValue(readyAttemptLesson());
    mocks.findUniqueAttempt.mockResolvedValue(null);
    mocks.executeAtomicBatch.mockImplementation(
      async (statements: Array<unknown>) => statements.map(() => ({ changes: 1 })),
    );

    await submitPersonalizedLessonAttempt({
      userId: "learner-1",
      lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exerciseId: "exercise-1",
      answer: "ticket",
      clientAttemptId: "client-attempt-canvas",
      responseTimeMs: 800,
      hintCount: 2,
      confidence: 3,
      assistMode: "TILES",
    });
    const withCanvas = (mocks.executeAtomicBatch.mock.calls.at(-1)![0] as Array<{ sql: string; values: unknown[] }>)[0]!;
    expect(withCanvas.sql).toContain('"responseTimeMs", "hintCount", "confidence", "assistMode", "createdAt"');
    expect(withCanvas.values.slice(10, 14)).toEqual([800, 2, 3, "TILES"]);

    await submitPersonalizedLessonAttempt({
      userId: "learner-1",
      lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exerciseId: "exercise-1",
      answer: "ticket",
      clientAttemptId: "client-attempt-plain",
    });
    const plain = (mocks.executeAtomicBatch.mock.calls.at(-1)![0] as Array<{ sql: string; values: unknown[] }>)[0]!;
    expect(plain.values.slice(10, 14)).toEqual([null, 0, null, null]);
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


// Plan13 SPEC-P131 §4: async claim/run, PL1 lease, PL2 per-exercise idempotency.
describe("Plan13 personalized async generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveAICall.mockResolvedValue({ id: "reservation-1", userId: "learner-1", purpose: "personalized_lesson" });
    mocks.settleAICall.mockResolvedValue(undefined);
    mocks.profile.mockResolvedValue({ estimatedCefrLevel: "A2", calibrationStatus: "UNASSESSED", preferredTopics: "travel" });
    mocks.skills.mockResolvedValue([{ skillKey: "vocabulary", masteryScore: 0.35 }]);
    mocks.dueVocabulary.mockResolvedValue([]);
    mocks.curriculumVocabulary.mockResolvedValue([]);
    mocks.evidence.mockResolvedValue([]);
    mocks.interactions.mockResolvedValue([]);
    mocks.findFirstLesson.mockResolvedValue(null);
    mocks.findFirstAttempt.mockResolvedValue(null);
    mocks.updateManyLesson.mockResolvedValue({ count: 1 });
    mocks.createLesson.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    mocks.provider.mockReturnValue({ providerName: "vyce", modelName: "claude-sonnet-4-6", generateJson: mocks.generateJson });
  });

  it("claims a new row with a generation lease and reservation without calling the provider", async () => {
    mocks.findUniqueLesson.mockResolvedValue(null);

    const claim = await claimPersonalizedLessonGeneration("learner-1", "vocabulary");

    expect(claim.kind).toBe("claimed");
    expect(mocks.createLesson).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "GENERATING", generationAttempt: 1, generationStartedAt: expect.any(Date) }),
    }));
    expect(mocks.reserveAICall).toHaveBeenCalledOnce();
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(claim.kind === "claimed" && claim.retryAfterSeconds).toBe(3);
  });

  it("reclaims a FAILED row by CAS on its old key, bumping the attempt and restarting the lease (PL1)", async () => {
    // Regression: the old stale check used createdAt, so a reused FAILED row
    // was "stale" immediately and a second claim overwrote the first key.
    mocks.findUniqueLesson.mockResolvedValue({ ...generatingLesson(), status: "FAILED", generationKey: "old-key", createdAt: new Date(Date.now() - 60 * 60_000), generationStartedAt: null });

    const claim = await claimPersonalizedLessonGeneration("learner-1", "vocabulary");

    expect(claim.kind).toBe("claimed");
    expect(mocks.updateManyLesson).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", generationKey: "old-key" },
      data: expect.objectContaining({ status: "GENERATING", generationAttempt: { increment: 1 }, generationStartedAt: expect.any(Date) }),
    }));
    expect(claim.kind === "claimed" && claim.generationKey).not.toBe("old-key");
  });

  it("reports in-progress for a GENERATING row whose generation lease is still fresh", async () => {
    mocks.findUniqueLesson.mockResolvedValue({ ...generatingLesson(), createdAt: new Date(Date.now() - 60 * 60_000), generationStartedAt: new Date(Date.now() - 10_000) });

    await expect(claimPersonalizedLessonGeneration("learner-1", "vocabulary")).resolves.toMatchObject({ kind: "in-progress", lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", retryAfterSeconds: 3 });
    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.updateManyLesson).not.toHaveBeenCalled();
  });

  it("marks the claimed row FAILED and rethrows when the AI reservation is refused", async () => {
    mocks.findUniqueLesson.mockResolvedValue(null);
    mocks.reserveAICall.mockRejectedValue(new AIRequestBudgetError({ reason: "DAILY_LIMIT", retryAfterSeconds: 3600 }));

    await expect(claimPersonalizedLessonGeneration("learner-1", "vocabulary")).rejects.toMatchObject({ code: "AI_REQUEST_LIMIT" });
    expect(mocks.updateManyLesson).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED", failureCode: "AI_REQUEST_LIMIT" } }));
  });

  it("runs the generation to READY after the claim and settles the reservation once", async () => {
    mocks.findUniqueLesson.mockResolvedValueOnce(null).mockResolvedValueOnce(readyLesson());
    mocks.generateJson.mockResolvedValue({ output: generatedDraft(), provider: "vyce", model: "claude-sonnet-4-6", requestId: "r-1" });
    mocks.executeAtomicBatch.mockImplementation(async (statements: Array<{ sql: string }>) =>
      statements.map((statement) => ({ changes: statement.sql.includes("SET \"status\" = 'READY'") || statement.sql.includes('SET "failureCode" = NULL') ? 1 : 0 })));

    const claim = await claimPersonalizedLessonGeneration("learner-1", "vocabulary") as Extract<PersonalizedGenerationClaim, { kind: "claimed" }>;
    const result = await runPersonalizedLessonGeneration(claim);

    expect(result).toMatchObject({ status: "READY", lesson: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "READY" } });
    expect(mocks.settleAICall).toHaveBeenCalledTimes(1);
    expect(mocks.settleAICall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: true }));
  });

  it("never throws from run: a provider failure becomes a FAILED row the client can poll", async () => {
    mocks.findUniqueLesson.mockResolvedValue(null);
    mocks.generateJson.mockRejectedValue(new AIUnavailableError({ reason: "timeout" }));

    const claim = await claimPersonalizedLessonGeneration("learner-1", "vocabulary") as Extract<PersonalizedGenerationClaim, { kind: "claimed" }>;
    await expect(runPersonalizedLessonGeneration(claim)).resolves.toEqual({ status: "FAILED", failureCode: "AI_UNAVAILABLE" });
    expect(mocks.settleAICall).toHaveBeenCalledTimes(1);
    expect(mocks.settleAICall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false, failureReason: "timeout" }));
  });

  it("exposes GENERATING/FAILED status without content and treats an expired lease as FAILED", async () => {
    mocks.findFirstLesson.mockResolvedValueOnce({ ...generatingLesson(), generationStartedAt: new Date(), generationAttempt: 2 });
    await expect(getOwnedPersonalizedLessonStatus("learner-1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toMatchObject({
      status: "GENERATING", generationAttempt: 2, retryAfterSeconds: 3, targetSkill: "vocabulary",
    });

    mocks.findFirstLesson.mockResolvedValueOnce({ ...generatingLesson(), generationStartedAt: new Date(Date.now() - 300_000), generationAttempt: 1 });
    await expect(getOwnedPersonalizedLessonStatus("learner-1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toMatchObject({
      status: "FAILED", failureCode: "GENERATION_TIMEOUT",
    });

    mocks.findFirstLesson.mockResolvedValueOnce(null);
    await expect(getOwnedPersonalizedLessonStatus("someone-else", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toMatchObject({ code: "PRIVATE_NOT_FOUND" });
  });

  it("replays the stored result for an exercise that was already graded instead of minting new evidence (PL2)", async () => {
    mocks.findFirstLesson.mockResolvedValue(readyAttemptLesson());
    mocks.findUniqueAttempt.mockResolvedValue(null);
    mocks.findFirstAttempt.mockResolvedValue({ id: "graded-1", score: 0, correct: false, feedbackVi: "Chưa đúng. Ticket là vé đi lại." });

    const result = await submitPersonalizedLessonAttempt({
      userId: "learner-1", lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", exerciseId: "exercise-1", answer: "ticket", clientAttemptId: "second-try-uuid",
    });

    expect(result.attempt).toEqual({ id: "graded-1", score: 0, correct: false, feedbackVi: "Chưa đúng. Ticket là vé đi lại.", idempotent: true });
    expect(mocks.executeAtomicBatch).not.toHaveBeenCalled();
    expect(mocks.findFirstAttempt).toHaveBeenCalledWith(expect.objectContaining({ where: { lessonId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "learner-1", exerciseId: "exercise-1" } }));
  });
});
