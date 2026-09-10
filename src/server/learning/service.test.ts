import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { LearningSessionRecord, LearningSessionSnapshot } from "./repository";
import { createMissionState, getMissionTemplate } from "@/server/ai/mission-templates";
import { planDailyQuest } from "@/server/ai/daily-quest";
import { AIUnavailableError } from "@/server/ai/errors";
import { createEvaluateTurnFallback, createStartMissionFallback } from "@/server/ai/tutor-fallback";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(), record: vi.fn(), learner: vi.fn(), recentQuestHistory: vi.fn(), transaction: vi.fn(),
  owned: vi.fn(), evaluate: vi.fn(), getMemory: vi.fn(), appendMemory: vi.fn(),
  start: vi.fn(), reserveAICall: vi.fn(), settleAICall: vi.fn(),
  atomicBatch: vi.fn(), planMemory: vi.fn(), memoryRecord: vi.fn(), mastery: vi.fn(), evidenceCount: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./repository", () => ({
  LearningSessionRepository: class {
    findOwnedSnapshot = mocks.snapshot;
    findOwned = mocks.record;
    findLearnerContext = mocks.learner;
    findRecentDailyQuestScenarioKeys = mocks.recentQuestHistory;
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
  mocks.recentQuestHistory.mockResolvedValue([]);
  mocks.getMemory.mockResolvedValue(null);
  mocks.appendMemory.mockResolvedValue(null);
  mocks.memoryRecord.mockResolvedValue(null);
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
        })
      : null;
    const startTemplate = getMissionTemplate(quest?.scenarioKey ?? input.scenarioKey);
    return {
      state: createMissionState(startTemplate, {
        goal: input.goal ?? quest?.goal,
        targetVocabulary: quest?.targetVocabulary,
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

describe("Daily Quest start history", () => {
  it("does not persist a session, AI turn, or evidence when live AI is unavailable", async () => {
    mocks.start.mockRejectedValue(
      new AIUnavailableError({ reason: "provider_not_configured" }),
    );

    await expect(
      createLearningSession(userId, { mode: "MISSION", scenarioKey: "cafe-order" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(record.turns).toEqual([]);
    expect(record.evidence).toEqual([]);
  });

  it("passes only the owned validated recent history into the real Quest start path", async () => {
    mocks.recentQuestHistory.mockResolvedValue(["cafe-order"]);

    const result = await createLearningSession(userId, { mode: "DAILY_QUEST" });

    expect(mocks.recentQuestHistory).toHaveBeenCalledWith(userId);
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      mode: "DAILY_QUEST",
      recentScenarioKeys: ["cafe-order"],
    }));
    expect(result.session.state.scenarioKey).not.toBe("cafe-order");
  });

  it("does not load Quest history for Mission or Coach starts", async () => {
    await createLearningSession(userId, { mode: "MISSION", scenarioKey: "cafe-order" });

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
    record.stateJson = JSON.stringify({ ...initialState, phase: "BOSS", turnCount: 7 });
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
