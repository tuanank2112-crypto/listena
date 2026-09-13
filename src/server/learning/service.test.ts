import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { LearningSessionRecord, LearningSessionSnapshot } from "./repository";
import { createMissionState, getMissionTemplate } from "@/server/ai/mission-templates";
import { planDailyQuest } from "@/server/ai/daily-quest";
import { createHash } from "node:crypto";
import { AIUnavailableError } from "@/server/ai/errors";
import { createEvaluateTurnFallback, createStartMissionFallback } from "@/server/ai/tutor-fallback";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(), record: vi.fn(), learner: vi.fn(), lessonForStart: vi.fn(), activeSession: vi.fn(), recentQuestHistory: vi.fn(), transaction: vi.fn(),
  owned: vi.fn(), evaluate: vi.fn(), getMemory: vi.fn(), appendMemory: vi.fn(),
  start: vi.fn(), reserveAICall: vi.fn(), settleAICall: vi.fn(),
  atomicBatch: vi.fn(), planMemory: vi.fn(), memoryRecord: vi.fn(), mastery: vi.fn(), evidenceCount: vi.fn(), startRequest: vi.fn(), pendingStart: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./repository", () => ({
  LearningSessionRepository: class {
    findOwnedSnapshot = mocks.snapshot;
    findOwned = mocks.record;
    findLearnerContext = mocks.learner;
    findLessonForStart = mocks.lessonForStart;
    findActiveSession = mocks.activeSession;
    findRecentDailyQuestScenarioKeys = mocks.recentQuestHistory;
    findStartRequest = mocks.startRequest;
    findPendingStartRequest = mocks.pendingStart;
    transaction = mocks.transaction;
  },
  findOwnedSessionInTransaction: mocks.owned,
}));
vi.mock("@/server/ai/tutor-orchestrator", () => ({
  evaluateTutorTurn: mocks.evaluate,
  startMission: mocks.start,
}));
vi.mock("@/server/learner-memory/repository", () => ({
  getLearnerMemory: mocks.getMemory,
  appendEvidenceToMemory: mocks.appendMemory,
  planLearnerMemoryEvidenceWrite: mocks.planMemory,
  parseLearnerMemory: (record: {
    id: string; userId: string; goalsJson: string; errorsJson: string; skillsJson: string; preferencesJson: string;
  }) => ({
    id: record.id, userId: record.userId, goals: JSON.parse(record.goalsJson),
    recurringErrors: JSON.parse(record.errorsJson), provenSkills: JSON.parse(record.skillsJson),
    preferences: JSON.parse(record.preferencesJson),
  }),
}));
vi.mock("@/server/ai/request-budget", () => ({
  reserveUserAICall: mocks.reserveAICall,
  settleUserAICall: mocks.settleAICall,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learnerMemory: { findUnique: mocks.memoryRecord },
    learningEvidence: { count: mocks.evidenceCount },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  libSqlBoolean: (value: boolean) => value ? 1 : 0,
  libSqlTimestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  executeAtomicLibSqlBatch: mocks.atomicBatch,
}));

import { completeLearningSession, createLearningSession, submitLearningTurn } from "./service";

const template = getMissionTemplate("lost-luggage");
const initialState = createMissionState(template);
const now = new Date("2026-09-07T05:10:00.000Z");
const userId = "learner-one";
const sessionId = "session-one";
const interventionId = "00000000-0000-4000-8000-000000000001";
const turnInput = { clientTurnId: "learner-turn-one", content: "suitcase", hintCount: 0, replayCount: 0 };

function storedIntervention() {
  return {
    id: interventionId, sessionId, sourceTurnId: null, type: "FILL_BLANK",
    prompt: "Complete the missing noun.", specJson: JSON.stringify({ placeholder: "One word" }),
    validatorJson: JSON.stringify({ acceptedAnswers: ["suitcase"] }),
    status: "PENDING" as const, outcomeJson: null, createdAt: now, completedAt: null,
  };
}

let record: LearningSessionRecord;
let tx: ReturnType<typeof makeTransaction>;
afterEach(() => vi.useRealTimers());

function makeTransaction() {
  return {
    learningSession: {
      create: vi.fn(async ({ data }: { data: Partial<LearningSessionRecord> }) => {
        Object.assign(record, data);
        return record;
      }),
      update: vi.fn(async ({ data }: { data: Partial<LearningSessionRecord> }) => Object.assign(record, data)),
      updateMany: vi.fn(async ({ where, data }: {
        where: { status: string }; data: Partial<LearningSessionRecord>;
      }) => {
        if (record.status !== where.status) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      }),
    },
    learningTurn: {
      findUnique: vi.fn(async ({ where }: { where: { sessionId_clientTurnId: { clientTurnId: string } } }) =>
        record.turns.find((turn) => turn.clientTurnId === where.sessionId_clientTurnId.clientTurnId) ?? null),
      findFirst: vi.fn(async () => record.turns.at(-1) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<LearningSessionRecord["turns"][number], "id" | "createdAt"> }) => {
        const turn = { ...data, id: `turn-${record.turns.length}`, createdAt: now };
        record.turns.push(turn);
        return turn;
      }),
    },
    learningEvidence: {
      count: vi.fn(async () => record.evidence.length),
      create: vi.fn(async ({ data }: { data: LearningSessionRecord["evidence"][number] }) => {
        const evidence = { ...data, id: `evidence-${record.evidence.length}`, createdAt: now };
        record.evidence.push(evidence);
        return evidence;
      }),
    },
    intervention: {
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string }; data: Partial<LearningSessionRecord["interventions"][number]>;
      }) => {
        const challenge = record.interventions.find((item) => item.id === where.id);
        if (!challenge || challenge.status !== "PENDING") return { count: 0 };
        Object.assign(challenge, data);
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: ReturnType<typeof storedIntervention> }) => {
        const challenge = { ...data, id: `challenge-${record.interventions.length}`, status: "PENDING" as const, createdAt: now };
        record.interventions.push(challenge);
        return challenge;
      }),
    },
    aIInteraction: { create: vi.fn(async () => ({})) },
    skillMastery: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
    learnerProfile: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
}

type AtomicStatement = {
  sql: string;
  values?: Array<string | number | null>;
};

function asDate(value: string | number | null | undefined) {
  return new Date(typeof value === "number" ? value : String(value));
}

async function executeAtomicTestBatch(statements: AtomicStatement[]) {
  const changes = statements.map(() => 1);
  const start = statements[0];
  if (start?.sql.includes('INSERT INTO "LearningSession"')) {
    const values = start.values ?? [];
    record.id = String(values[0]);
    record.mode = String(values[3]) as LearningSessionRecord["mode"];
    record.goal = String(values[4]);
    record.levelSnapshot = String(values[5]) as LearningSessionRecord["levelSnapshot"];
    record.stateJson = String(values[6]);
    record.startedAt = asDate(values[7]);
    record.updatedAt = asDate(values[8]);
    const opening = statements[1]?.values ?? [];
    record.turns.push({
      id: String(opening[0]), sequence: 1, clientTurnId: String(opening[2]),
      actor: "AI", turnType: "PROMPT", contentJson: String(opening[3]),
      skillTags: String(opening[4]), createdAt: asDate(opening[5]),
    } as never);
    return changes.map((count) => ({ changes: count }));
  }

  if (start?.sql.includes('UPDATE "LearnerProfile"') && statements[1]?.sql.includes('UPDATE "LearningSession"')) {
    const profile = start.values ?? [];
    const session = statements[1]?.values ?? [];
    const updateLearningSession = tx.learningSession.updateMany as unknown as (args: {
      where: { status: string }; data: Partial<LearningSessionRecord>;
    }) => Promise<{ count: number }>;
    const updateLearnerProfile = tx.learnerProfile.updateMany as unknown as (args: unknown) => Promise<{ count: number }>;
    const sessionResult = await updateLearningSession({
     where: { status: "ACTIVE" },
      data: {
        status: "COMPLETED", completedAt: asDate(session[0]), stateJson: String(session[1]),
        summary: String(session[2]), updatedAt: asDate(session[3]),
      },
    });
    if (sessionResult.count !== 1) return [{ changes: 0 }, { changes: 0 }];
    const profileResult = await updateLearnerProfile({
      where: { userId: String(profile[3]) },
      data: { totalStudyMinutes: { increment: Number(profile[0]) }, lastActivityAt: asDate(profile[1]) },
    });
    return [{ changes: profileResult.count }, { changes: sessionResult.count }];
  }

  const learner = statements.find((statement) => statement.sql.includes("'LEARNER'"));
  if (learner) {
    const values = learner.values ?? [];
    const learnerTurn = {
      id: String(values[0]), sequence: record.turns.length + 1, clientTurnId: String(values[3]),
      actor: "LEARNER", turnType: String(values[4]), contentJson: String(values[5]),
      skillTags: String(values[6]), createdAt: asDate(values[7]),
    };
    record.turns.push(learnerTurn as never);
    const ai = statements.find((statement) => statement.sql.includes("'AI'"));
    if (ai) {
      const aiValues = ai.values ?? [];
      record.turns.push({
        id: String(aiValues[0]), sequence: record.turns.length + 1, clientTurnId: String(aiValues[3]),
        actor: "AI", turnType: String(aiValues[4]), contentJson: String(aiValues[5]),
        skillTags: String(aiValues[6]), createdAt: asDate(aiValues[7]),
      } as never);
    }
    const evidence = statements.find((statement) => statement.sql.includes('INSERT INTO "LearningEvidence"'));
    if (evidence) {
      const evidenceValues = evidence.values ?? [];
      record.evidence.push({
        id: String(evidenceValues[0]), turnId: String(evidenceValues[2]), skillKey: String(evidenceValues[3]),
        evidenceType: String(evidenceValues[4]), score: Number(evidenceValues[5]), confidence: Number(evidenceValues[6]),
        difficulty: 1, hintCount: Number(evidenceValues[7]), replayCount: Number(evidenceValues[8]),
        responseTimeMs: evidenceValues[9] === null ? null : Number(evidenceValues[9]), createdAt: asDate(evidenceValues[10]),
      } as never);
    }
    const mastery = statements.find((statement) => statement.sql.includes('INSERT INTO "SkillMastery"'));
    if (mastery) {
      const masteryValues = mastery.values ?? [];
      const upsertSkillMastery = tx.skillMastery.upsert as unknown as (args: unknown) => Promise<unknown>;
      await upsertSkillMastery({ create: { masteryScore: Number(masteryValues[3]) } });
    }
    for (const statement of statements) {
      const values = statement.values ?? [];
      if (statement.sql.includes('UPDATE "Intervention"')) {
        const intervention = record.interventions.find((item) => item.id === values[2]);
        if (intervention) Object.assign(intervention, { status: "COMPLETED", outcomeJson: String(values[0]), completedAt: asDate(values[1]) });
      }
      if (statement.sql.includes('INSERT INTO "Intervention"')) {
        record.interventions.push({
          id: String(values[0]), sessionId: String(values[1]), sourceTurnId: String(values[2]),
          type: String(values[3]), prompt: String(values[4]), specJson: String(values[5]), validatorJson: String(values[6]),
          status: "PENDING", outcomeJson: null, createdAt: asDate(values[7]), completedAt: null,
        } as never);
      }
      if (statement.sql.includes('UPDATE "LearningSession"') && statement.sql.includes('SET "status" = \'COMPLETED\'')) {
        const updateLearningSession = tx.learningSession.updateMany as unknown as (args: {
          where: { status: string }; data: Partial<LearningSessionRecord>;
        }) => Promise<{ count: number }>;
        await updateLearningSession({
          where: { status: "ACTIVE" },
          data: { status: "COMPLETED", completedAt: asDate(values[0]), stateJson: String(values[1]), summary: String(values[2]), updatedAt: asDate(values[3]) },
        });
      } else if (statement.sql.includes('UPDATE "LearningSession"') && statement.sql.includes('SET "stateJson" = ?')) {
        Object.assign(record, { stateJson: String(values[0]), updatedAt: asDate(values[1]) });
      }
      if (statement.sql.includes('UPDATE "LearnerProfile"')) {
        const updateLearnerProfile = tx.learnerProfile.updateMany as unknown as (args: unknown) => Promise<{ count: number }>;
        await updateLearnerProfile({
          where: { userId: String(values[3] ?? values[0]) },
          data: { totalStudyMinutes: { increment: Number(values[0]) }, lastActivityAt: asDate(values[1]) },
        });
      }
    }
  }
  return changes.map((count) => ({ changes: count }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  record = {
    id: sessionId, userId, lessonId: null, mode: "MISSION", status: "ACTIVE",
    goal: initialState.learnerGoal, levelSnapshot: "A2", stateJson: JSON.stringify(initialState),
    summary: null, startedAt: new Date("2026-09-07T05:00:00.000Z"), updatedAt: now,
    completedAt: null, lesson: null, turns: [], evidence: [], interventions: [],
  };
  tx = makeTransaction();
  mocks.record.mockImplementation(async () => record);
  mocks.snapshot.mockImplementation(async () => structuredClone(record) as unknown as LearningSessionSnapshot);
  mocks.owned.mockImplementation(async () => ({ ...record }));
  mocks.learner.mockResolvedValue({ learnerProfile: null, skillMastery: [], dueVocabulary: [] });
  mocks.lessonForStart.mockResolvedValue(null);
  mocks.activeSession.mockResolvedValue(null);
  mocks.recentQuestHistory.mockResolvedValue([]);
  mocks.getMemory.mockResolvedValue(null);
  mocks.appendMemory.mockResolvedValue(null);
  mocks.memoryRecord.mockResolvedValue(null);
  mocks.startRequest.mockResolvedValue(null);
  mocks.pendingStart.mockResolvedValue(null);
  mocks.evidenceCount.mockImplementation(async () => record.evidence.length);
  mocks.planMemory.mockImplementation((_userId: string, _existing: unknown, evidence: {
    id: string; skillKey: string; score: number;
  }) => ({
    create: {
      userId, goalsJson: "[]", errorsJson: "[]",
      skillsJson: JSON.stringify([{ skillKey: evidence.skillKey, masteryScore: evidence.score, evidenceCount: 1, lastEvidenceId: evidence.id }]),
      preferencesJson: "{}",
    },
    update: { errorsJson: "[]", skillsJson: "[]" },
  }));
  mocks.atomicBatch.mockImplementation(executeAtomicTestBatch);
  mocks.reserveAICall.mockImplementation(async ({ userId: reservationUserId, purpose }: {
    userId: string; purpose: string;
  }) => ({ id: `reservation-${purpose}`, userId: reservationUserId, purpose }));
  mocks.settleAICall.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (work: (client: Prisma.TransactionClient) => unknown) => work(tx as unknown as Prisma.TransactionClient));
  mocks.evaluate.mockImplementation(async ({ state, learnerMessage }) => ({
    output: createEvaluateTurnFallback({ state, learnerMessage, template }),
    meta: { provider: "test", promptVersion: "test", groundedKnowledgeIds: [] },
  }));
  mocks.start.mockImplementation(async (input) => {
    const quest = input.mode === "DAILY_QUEST"
      ? planDailyQuest({
          learnerKey: input.learnerKey,
          dateKey: now.toISOString().slice(0, 10),
          skillMastery: input.learnerContext?.skillMastery,
          dueVocabulary: input.learnerContext?.dueVocabulary,
          preferredTopics: input.learnerContext?.preferredTopics,
          recentScenarioKeys: input.recentScenarioKeys,
          scenarioKey: input.scenarioKey,
        })
      : null;
    const startTemplate = getMissionTemplate(quest?.scenarioKey ?? input.scenarioKey);
    return {
      state: createMissionState(startTemplate, {
        goal: input.goal ?? quest?.goal,
        targetVocabulary: quest?.targetVocabulary,
        maxTurns: input.maxTurns,
      }),
      opening: createStartMissionFallback(startTemplate),
      meta: { provider: "test", promptVersion: "test", groundedKnowledgeIds: [] },
    };
  });
});

function addEvidence() {
  record.evidence.push({
    id: `evidence-${record.evidence.length}`,
    turnId: null,
    skillKey: "communication",
    evidenceType: "TUTOR_TURN",
    score: 0.4,
    confidence: 1,
    difficulty: 1,
    hintCount: 0,
    replayCount: 0,
    responseTimeMs: null,
    createdAt: now,
  });
}

function startPayloadHash(input: {
  lessonId?: string;
  mode: "LESSON_COACH" | "MISSION" | "DAILY_QUEST";
  goal?: string;
  scenarioKey?: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      lessonId: input.lessonId ?? null,
      mode: input.mode,
      goal: input.goal ?? null,
      scenarioKey: input.scenarioKey ?? null,
    }))
    .digest("hex");
}

function savedStartRequest(input: {
  clientStartId: string;
  lessonId?: string;
  mode: "LESSON_COACH" | "MISSION" | "DAILY_QUEST";
  goal?: string;
  scenarioKey?: string;
}, overrides: Record<string, unknown> = {}) {
  return {
    id: "start-request-1",
    userId,
    clientStartId: input.clientStartId,
    payloadHash: startPayloadHash(input),
    status: "PENDING",
    sessionId: null,
    errorCode: null,
    errorRetryAfterSeconds: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("session start idempotency ledger", () => {
  const input = {
    clientStartId: "00000000-0000-4000-8000-000000000101",
    mode: "MISSION" as const,
    scenarioKey: "cafe-order",
  };

  it("replays a committed owned session before mutable context or provider work", async () => {
    record.id = "already-committed";
    mocks.startRequest.mockResolvedValue(savedStartRequest(input, {
      status: "COMMITTED",
      sessionId: record.id,
    }));

    const result = await createLearningSession(userId, input);

    expect(result).toMatchObject({ idempotent: true, session: { id: record.id } });
    expect(mocks.learner).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.atomicBatch).not.toHaveBeenCalled();
  });

  it("rejects a changed body for an existing key before any provider or write", async () => {
    mocks.startRequest.mockResolvedValue(savedStartRequest(input, { payloadHash: "other-payload" }));

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.atomicBatch).not.toHaveBeenCalled();
  });

  it("returns an idempotency conflict before validating a changed replay body", async () => {
    mocks.startRequest.mockResolvedValue(savedStartRequest(input));

    await expect(createLearningSession(userId, {
      clientStartId: input.clientStartId,
      mode: "LESSON_COACH",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps a fresh pending request behind a bounded retry response", async () => {
    mocks.startRequest.mockResolvedValue(savedStartRequest(input));

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "START_IN_PROGRESS",
      status: 409,
      retryAfterSeconds: 2,
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.reserveAICall).not.toHaveBeenCalled();
  });

  it("does not reserve a second AI call while another primary start owns the user lease", async () => {
    mocks.atomicBatch.mockResolvedValue([{ changes: 0 }]);
    mocks.pendingStart.mockResolvedValue(savedStartRequest({
      clientStartId: "00000000-0000-4000-8000-000000000199",
      mode: "MISSION",
      scenarioKey: "lost-luggage",
    }));

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "START_IN_PROGRESS",
      status: 409,
      retryAfterSeconds: 2,
    });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    const claim = mocks.atomicBatch.mock.calls[0]?.[0]?.[0] as AtomicStatement;
    expect(claim.sql).toContain('WHERE "userId" = ? AND "status" = \'PENDING\'');
  });

  it("marks an expired foreign lease unknown without silently starting another provider call", async () => {
    mocks.atomicBatch.mockImplementation(async (statements: AtomicStatement[]) => {
      const first = statements[0];
      if (first?.sql.includes('INSERT INTO "LearningSessionStartRequest"')) {
        return [{ changes: 0 }];
      }
      if (first?.sql.includes("SET \"status\" = 'UNKNOWN'")) {
        return [{ changes: 1 }];
      }
      return [{ changes: 0 }];
    });
    mocks.pendingStart.mockResolvedValue(savedStartRequest({
      clientStartId: "00000000-0000-4000-8000-000000000198",
      mode: "MISSION",
      scenarioKey: "lost-luggage",
    }, {
      updatedAt: new Date(now.getTime() - 120_001),
    }));

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "START_OUTCOME_UNKNOWN",
      status: 409,
    });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("replays a persisted, safe budget failure with its bounded retry window", async () => {
    mocks.startRequest.mockResolvedValue(savedStartRequest(input, {
      status: "FAILED",
      errorCode: "AI_REQUEST_LIMIT",
      errorRetryAfterSeconds: 9,
    }));

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "AI_REQUEST_LIMIT",
      status: 429,
      details: { retryAfterSeconds: 9 },
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.reserveAICall).not.toHaveBeenCalled();
  });

  it("re-reads a proven COMMITTED row when the atomic graph response is lost", async () => {
    const committedSessionId = "committed-after-lost-response";
    record.id = committedSessionId;
    mocks.startRequest.mockResolvedValue(null);
    mocks.atomicBatch.mockImplementation(async (statements: AtomicStatement[]) => {
      if (statements[0]?.sql.includes('INSERT INTO "LearningSession"')) {
        mocks.startRequest.mockResolvedValue(savedStartRequest(input, {
          status: "COMMITTED",
          sessionId: committedSessionId,
        }));
        throw new Error("libSQL response was lost after commit");
      }
      return [{ changes: 1 }];
    });

    const result = await createLearningSession(userId, input);

    expect(result).toMatchObject({ idempotent: true, session: { id: committedSessionId } });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.reserveAICall).toHaveBeenCalledOnce();
    expect(mocks.startRequest).toHaveBeenCalledTimes(2);
  });
});

describe("Daily Quest start history", () => {
  it("rejects a second primary start before reserving an AI call when an active session exists", async () => {
    mocks.activeSession.mockResolvedValue({ id: "active-session" });

    await expect(createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000010",
      mode: "MISSION",
      scenarioKey: "cafe-order",
    })).rejects.toMatchObject({ code: "ACTIVE_SESSION_EXISTS", status: 409 });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.atomicBatch).not.toHaveBeenCalled();
  });

  it("turns an atomic active-session fence loss into a replayable typed conflict", async () => {
    mocks.atomicBatch.mockImplementation(async (statements: AtomicStatement[]) => {
      if (statements[0]?.sql.includes('INSERT INTO "LearningSession"')) {
        return statements.map((_, index) => ({ changes: index === statements.length - 2 ? 1 : 0 }));
      }
      return [{ changes: 1 }];
    });

    await expect(createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000020",
      mode: "MISSION",
      scenarioKey: "cafe-order",
    })).rejects.toMatchObject({ code: "ACTIVE_SESSION_EXISTS", status: 409 });

    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.reserveAICall).toHaveBeenCalledOnce();
  });

  it("turns a Coach lesson unpublish race into a durable typed unavailable target", async () => {
    const input = {
      clientStartId: "00000000-0000-4000-8000-000000000021",
      mode: "LESSON_COACH" as const,
      lessonId: "00000000-0000-4000-8000-000000000022",
    };
    mocks.lessonForStart.mockResolvedValue({
      id: input.lessonId,
      title: "Listen at work",
      topic: "listening",
      transcript: "A short conversation.",
      learningObjectives: "listening",
      cefrLevel: "A2",
      vocabulary: [],
    });
    mocks.atomicBatch.mockImplementation(async (statements: AtomicStatement[]) => {
      if (statements[0]?.sql.includes('INSERT INTO "LearningSession"')) {
        return statements.map((statement) => ({
          changes: statement.sql.includes("'TARGET_UNAVAILABLE'") ? 1 : 0,
        }));
      }
      return [{ changes: 1 }];
    });

    await expect(createLearningSession(userId, input)).rejects.toMatchObject({
      code: "TARGET_UNAVAILABLE",
      status: 404,
    });

    expect(mocks.reserveAICall).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledOnce();
    const graph = mocks.atomicBatch.mock.calls.find(
      ([statements]) => (statements as AtomicStatement[])[0]?.sql.includes('INSERT INTO "LearningSession"'),
    )?.[0] as AtomicStatement[];
    expect(graph[0]?.sql).toContain('"status" = \'PUBLISHED\'');
  });

  it("does not persist a session, AI turn, or evidence when live AI is unavailable", async () => {
    mocks.start.mockRejectedValue(
      new AIUnavailableError({ reason: "provider_not_configured" }),
    );

    await expect(
      createLearningSession(userId, { clientStartId: "00000000-0000-4000-8000-000000000011", mode: "MISSION", scenarioKey: "cafe-order" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(record.turns).toEqual([]);
    expect(record.evidence).toEqual([]);
  });

  it("passes only the owned validated recent history into the real Quest start path", async () => {
    mocks.recentQuestHistory.mockResolvedValue(["cafe-order"]);

    const result = await createLearningSession(userId, { clientStartId: "00000000-0000-4000-8000-000000000012", mode: "DAILY_QUEST" });

    expect(mocks.recentQuestHistory).toHaveBeenCalledWith(userId);
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      mode: "DAILY_QUEST",
      recentScenarioKeys: ["cafe-order"],
    }));
    expect(result.session.state.scenarioKey).not.toBe("cafe-order");
  });

  it("honors a planner-pinned Quest scenario instead of generating a different one", async () => {
    mocks.recentQuestHistory.mockResolvedValue(["lost-luggage"]);

    const result = await createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000014",
      mode: "DAILY_QUEST",
      scenarioKey: "cafe-order",
    });

    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      mode: "DAILY_QUEST",
      scenarioKey: "cafe-order",
    }));
    expect(result.session.state.scenarioKey).toBe("cafe-order");
  });

  it("derives the session turn budget from saved learner intent on the server", async () => {
    mocks.getMemory.mockResolvedValue({
      id: "memory-1",
      userId,
      goals: [],
      recurringErrors: [],
      provenSkills: [],
      preferences: { dailyMinutes: 5 },
    });

    const result = await createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000015",
      mode: "MISSION",
      scenarioKey: "cafe-order",
    });

    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ maxTurns: 5 }));
    expect(result.session.state.maxTurns).toBe(5);
  });

  it("rejects an unavailable scenario before reserving a provider call", async () => {
    await expect(createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000016",
      mode: "MISSION",
      // Inherited object names must not pass an authored-template guard.
      scenarioKey: "toString",
    })).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE", status: 404 });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.atomicBatch).not.toHaveBeenCalled();
  });

  it("requires a Mission scenario instead of silently choosing a default", async () => {
    await expect(createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000017",
      mode: "MISSION",
    })).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE", status: 404 });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("returns a typed unavailable target when a Coach lesson disappears before start", async () => {
    await expect(createLearningSession(userId, {
      clientStartId: "00000000-0000-4000-8000-000000000018",
      mode: "LESSON_COACH",
      lessonId: "00000000-0000-4000-8000-000000000019",
    })).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE", status: 404 });

    expect(mocks.reserveAICall).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not load Quest history for Mission or Coach starts", async () => {
    await createLearningSession(userId, { clientStartId: "00000000-0000-4000-8000-000000000013", mode: "MISSION", scenarioKey: "cafe-order" });

    expect(mocks.recentQuestHistory).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith(expect.not.objectContaining({
      recentScenarioKeys: expect.anything(),
    }));
  });
});

describe("session intervention persistence", () => {
  it("does not write a learner turn, fictitious AI turn, or evidence when live AI is unavailable", async () => {
    mocks.evaluate.mockRejectedValue(
      new AIUnavailableError({ reason: "provider_not_configured" }),
    );

    await expect(
      submitLearningTurn(userId, sessionId, turnInput),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(record.turns).toEqual([]);
    expect(record.evidence).toEqual([]);
  });

  it("writes memory with the exact new evidence in the atomic batch and skips it on retry", async () => {
    await submitLearningTurn(userId, sessionId, turnInput);
    await submitLearningTurn(userId, sessionId, turnInput);

    expect(mocks.atomicBatch).toHaveBeenCalledOnce();
    const statements = mocks.atomicBatch.mock.calls[0]?.[0] as Array<{ sql: string; values: Array<unknown> }>;
    expect(statements.some((statement) => statement.sql.includes('INSERT INTO "LearnerMemory"'))).toBe(true);
    expect(record.evidence).toHaveLength(1);
  });

  it.each(["FILL_BLANK", "CHOICE"])("uses a correct short %s answer consistently across feedback, state, evidence and mastery", async (type) => {
    record.stateJson = JSON.stringify({ ...initialState, phase: "COMEBACK" });
    const challenge = storedIntervention();
    if (type === "CHOICE") {
      challenge.type = type;
      challenge.specJson = JSON.stringify({ options: ["suitcase", "ticket"] });
      challenge.validatorJson = JSON.stringify({ correctIndex: 0 });
    }
    record.interventions.push(challenge);

    const result = await submitLearningTurn(userId, sessionId, {
      ...turnInput, interventionId, content: type === "CHOICE" ? "0" : "suitcase",
    });

    expect(result.session.state).toMatchObject({ phase: "CONSEQUENCE", successfulTurns: 1, recoveryCount: 1 });
    expect(result.aiTurn?.content).toMatchObject({ score: 1, confidence: 1, detectedError: null, intervention: null, shouldComplete: false });
    expect(result.aiTurn?.content).not.toHaveProperty("validator");
    expect(result.evidence[0]).toMatchObject({ score: 1, confidence: 1 });
    expect(tx.skillMastery.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ masteryScore: 0.59 }) }));
    expect(record.interventions[0].status).toBe("COMPLETED");
    expect(tx.learnerProfile.updateMany).not.toHaveBeenCalled();
  });

  it("overrides a false successful BOSS response, repeats the challenge and persists identical retry output", async () => {
    record.stateJson = JSON.stringify({ ...initialState, phase: "BOSS", turnCount: 6 });
    record.interventions.push(storedIntervention());
    const input = { ...turnInput, interventionId, content: "I need my flight ticket" };

    const result = await submitLearningTurn(userId, sessionId, input);
    const retry = await submitLearningTurn(userId, sessionId, input);

    expect(result.session.status).toBe("ACTIVE");
    expect(result.session.state).toMatchObject({ phase: "BOSS", successfulTurns: 0, recoveryCount: 0, trust: initialState.trust });
    expect(result.aiTurn?.content).toMatchObject({ score: 0, shouldComplete: false, npcReply: expect.stringContaining("does not match") });
    expect(result.evidence[0].score).toBe(0);
    expect(result.intervention).toMatchObject({ type: "FILL_BLANK", prompt: "Complete the missing noun.", status: "PENDING" });
    expect(result.intervention?.spec).not.toHaveProperty("validator");
    expect(JSON.stringify(result.session)).not.toContain("acceptedAnswers");
    expect(retry).toEqual({ ...result, idempotent: true });
    expect(mocks.evaluate).toHaveBeenCalledOnce();
    expect(record.evidence).toHaveLength(1);
    expect(tx.learnerProfile.updateMany).not.toHaveBeenCalled();
  });
});

describe("session completion accounting", () => {
  it("commits the final allowed turn as PARTIAL and never sends a sixth turn to AI", async () => {
    record.stateJson = JSON.stringify({ ...initialState, turnCount: 4, maxTurns: 5 });
    mocks.evaluate.mockImplementation(async ({ state, learnerMessage }) => ({
      output: {
        ...createEvaluateTurnFallback({ state, learnerMessage, template }),
        shouldComplete: false,
      },
      meta: { provider: "test", promptVersion: "test", groundedKnowledgeIds: [] },
    }));

    const finalTurn = await submitLearningTurn(userId, sessionId, turnInput);

    expect(finalTurn.session).toMatchObject({
      status: "COMPLETED",
      completionOutcome: "PARTIAL",
      state: { phase: "DEBRIEF", turnCount: 5, maxTurns: 5 },
    });
    expect(record.evidence).toHaveLength(1);
    await expect(submitLearningTurn(userId, sessionId, {
      ...turnInput,
      clientTurnId: "learner-turn-six",
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.evaluate).toHaveBeenCalledOnce();
    expect(mocks.reserveAICall).toHaveBeenCalledOnce();
  });

  it("does not persist an unanswerable intervention on the final partial turn", async () => {
    record.stateJson = JSON.stringify({ ...initialState, turnCount: 4, maxTurns: 5 });
    mocks.evaluate.mockImplementation(async ({ state, learnerMessage }) => ({
      output: {
        ...createEvaluateTurnFallback({ state, learnerMessage, template }),
        shouldComplete: false,
        intervention: {
          type: "FILL_BLANK",
          prompt: "Name the missing item.",
          spec: { placeholder: "One word" },
          validator: { acceptedAnswers: ["suitcase"] },
        },
      },
      meta: { provider: "test", promptVersion: "test", groundedKnowledgeIds: [] },
    }));

    const finalTurn = await submitLearningTurn(userId, sessionId, turnInput);

    expect(finalTurn.session).toMatchObject({
      status: "COMPLETED",
      completionOutcome: "PARTIAL",
      state: { phase: "DEBRIEF", turnCount: 5 },
    });
    expect(finalTurn.aiTurn?.content).toMatchObject({
      pedagogicalAct: "REFLECT",
      intervention: null,
    });
    expect(finalTurn.intervention).toBeNull();
    expect(record.interventions).toHaveLength(0);
    expect(JSON.stringify(finalTurn)).not.toContain("acceptedAnswers");
  });

  it("counts natural completion once even when the final turn and complete endpoint are retried", async () => {
    record.stateJson = JSON.stringify({ ...initialState, phase: "BOSS", turnCount: 7 });
    const input = { ...turnInput, content: "I lost my black suitcase" };

    const result = await submitLearningTurn(userId, sessionId, input);
    await submitLearningTurn(userId, sessionId, input);
    await completeLearningSession(userId, sessionId);

    expect(result.session).toMatchObject({ status: "COMPLETED", completionOutcome: "COMPLETED", state: { phase: "DEBRIEF", successfulTurns: 1 } });
    expect(tx.learnerProfile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId }, data: { totalStudyMinutes: { increment: 10 }, lastActivityAt: now },
    });
    expect(tx.learningSession.updateMany).toHaveBeenCalledOnce();
  });

  it("completes a correct short BOSS intervention instead of persisting the fallback failure", async () => {
    record.stateJson = JSON.stringify({ ...initialState, phase: "BOSS", turnCount: 7 });
    record.interventions.push(storedIntervention());
    const result = await submitLearningTurn(userId, sessionId, { ...turnInput, interventionId });
    expect(result.session).toMatchObject({ status: "COMPLETED", completionOutcome: "COMPLETED", state: { phase: "DEBRIEF", successfulTurns: 1 } });
    expect(result.aiTurn?.content).toMatchObject({ score: 1, shouldComplete: true });
    expect(tx.learnerProfile.updateMany).toHaveBeenCalledOnce();
  });

  it.each([[0, 1], [10, 10], [300, 120]])("counts manual completion with %i elapsed minutes as %i, only once", async (elapsed, expected) => {
    record.startedAt = new Date(now.getTime() - elapsed * 60_000);
    addEvidence();
    const first = await completeLearningSession(userId, sessionId);
    const second = await completeLearningSession(userId, sessionId);
    expect(first.session.completionOutcome).toBe("PARTIAL");
    expect(second).toEqual(first);
    expect(tx.learnerProfile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId }, data: { totalStudyMinutes: { increment: expected }, lastActivityAt: now },
    });
  });

  it("rejects an untouched session without completing it or awarding study time", async () => {
    await expect(completeLearningSession(userId, sessionId)).rejects.toMatchObject({ status: 409 });

    expect(record.status).toBe("ACTIVE");
    expect(record.completedAt).toBeNull();
    expect(tx.learningSession.updateMany).not.toHaveBeenCalled();
    expect(tx.learnerProfile.updateMany).not.toHaveBeenCalled();
  });

  it("rejects abandoned completion and turns without writing evidence or minutes", async () => {
    record.status = "ABANDONED";
    await expect(completeLearningSession(userId, sessionId)).rejects.toMatchObject({ status: 409 });
    await expect(submitLearningTurn(userId, sessionId, turnInput)).rejects.toMatchObject({ status: 409 });
    expect(tx.learnerProfile.updateMany).not.toHaveBeenCalled();
    expect(tx.learningEvidence.create).not.toHaveBeenCalled();
  });

  it("does not increment minutes when the conditional completion transition loses a race", async () => {
    addEvidence();
    tx.learningSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completeLearningSession(userId, sessionId)).rejects.toMatchObject({ status: 409 });
    expect(tx.learnerProfile.updateMany).not.toHaveBeenCalled();
  });
});
