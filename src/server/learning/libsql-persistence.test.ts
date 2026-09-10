import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { createEvaluateTurnFallback, createStartMissionFallback } from "@/server/ai/tutor-fallback";
import { createMissionState, getMissionTemplate } from "@/server/ai/mission-templates";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  record: vi.fn(),
  learner: vi.fn(),
  recentQuestHistory: vi.fn(),
  transaction: vi.fn(),
  owned: vi.fn(),
  evaluate: vi.fn(),
  start: vi.fn(),
  getMemory: vi.fn(),
  appendMemory: vi.fn(),
  planMemory: vi.fn(),
  atomicBatch: vi.fn(),
  mastery: vi.fn(),
  evidenceCount: vi.fn(),
  memoryRecord: vi.fn(),
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
    id: string;
    userId: string;
    goalsJson: string;
    errorsJson: string;
    skillsJson: string;
    preferencesJson: string;
  }) => ({
    id: record.id,
    userId: record.userId,
    goals: JSON.parse(record.goalsJson),
    recurringErrors: JSON.parse(record.errorsJson),
    provenSkills: JSON.parse(record.skillsJson),
    preferences: JSON.parse(record.preferencesJson),
  }),
}));
vi.mock("@/server/ai/request-budget", () => ({
  reserveUserAICall: vi.fn(async ({ userId, purpose }: { userId: string; purpose: string }) => ({
    id: `reservation-${purpose}`,
    userId,
    purpose,
  })),
  settleUserAICall: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    skillMastery: { findUnique: mocks.mastery },
    learningEvidence: { count: mocks.evidenceCount },
    learnerMemory: { findUnique: mocks.memoryRecord },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  libSqlBoolean: (value: boolean) => value ? 1 : 0,
  libSqlTimestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  executeAtomicLibSqlBatch: mocks.atomicBatch,
}));

import { recordLearningEvent, submitLearningTurn } from "./service";

const userId = "learner-1";
const sessionId = "session-1";
const template = getMissionTemplate("lost-luggage");
const state = createMissionState(template);
let database: ReturnType<typeof createClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  await database.batch([
    {
      sql: `CREATE TABLE "LearningSession" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "lessonId" TEXT,
        "mode" TEXT NOT NULL, "status" TEXT NOT NULL, "goal" TEXT NOT NULL,
        "levelSnapshot" TEXT NOT NULL, "stateJson" TEXT NOT NULL, "summary" TEXT,
        "startedAt" TEXT NOT NULL, "completedAt" TEXT, "updatedAt" TEXT NOT NULL
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "LearningTurn" (
        "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
        "clientTurnId" TEXT NOT NULL, "actor" TEXT NOT NULL, "turnType" TEXT NOT NULL,
        "contentJson" TEXT NOT NULL, "skillTags" TEXT NOT NULL, "createdAt" TEXT NOT NULL,
        UNIQUE("sessionId", "sequence"), UNIQUE("sessionId", "clientTurnId")
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "LearningEvidence" (
        "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "turnId" TEXT,
        "skillKey" TEXT NOT NULL, "evidenceType" TEXT NOT NULL, "score" REAL NOT NULL,
        "confidence" REAL NOT NULL, "difficulty" REAL NOT NULL DEFAULT 1,
        "hintCount" INTEGER NOT NULL, "replayCount" INTEGER NOT NULL,
        "responseTimeMs" INTEGER, "createdAt" TEXT NOT NULL
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "SkillMastery" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "skillKey" TEXT NOT NULL,
        "masteryScore" REAL NOT NULL, "evidenceCount" INTEGER NOT NULL,
        "lastUpdatedAt" TEXT NOT NULL, UNIQUE("userId", "skillKey")
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "LearnerMemory" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "goalsJson" TEXT NOT NULL,
        "errorsJson" TEXT NOT NULL, "skillsJson" TEXT NOT NULL,
        "preferencesJson" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "Intervention" (
        "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "sourceTurnId" TEXT,
        "type" TEXT NOT NULL, "prompt" TEXT NOT NULL, "specJson" TEXT NOT NULL,
        "validatorJson" TEXT NOT NULL, "status" TEXT NOT NULL, "outcomeJson" TEXT,
        "createdAt" TEXT NOT NULL, "completedAt" TEXT
      )`, args: [],
    },
    {
      sql: `CREATE TABLE "AIInteraction" (
        "id" TEXT PRIMARY KEY, "userId" TEXT, "sessionId" TEXT, "turnId" TEXT,
        "purpose" TEXT NOT NULL, "model" TEXT, "provider" TEXT, "promptVersion" TEXT,
        "inputHash" TEXT, "validatedOutput" TEXT, "fallbackReason" TEXT,
        "schemaValid" INTEGER NOT NULL DEFAULT 1, "traceId" TEXT,
        "success" INTEGER NOT NULL DEFAULT 1, "createdAt" TEXT NOT NULL
      )`, args: [],
    },
  ], "write");
  await database.execute({
    sql: `INSERT INTO "LearningSession"
      ("id", "userId", "mode", "status", "goal", "levelSnapshot", "stateJson", "startedAt", "updatedAt")
      VALUES (?, ?, 'MISSION', 'ACTIVE', ?, 'A2', ?, ?, ?)`,
    args: [
      sessionId,
      userId,
      state.learnerGoal,
      JSON.stringify(state),
      "2026-09-10T10:00:00.000+00:00",
      "2026-09-10T10:00:00.000+00:00",
    ],
  });

  const snapshot = {
    id: sessionId,
    userId,
    lessonId: null,
    mode: "MISSION",
    status: "ACTIVE",
    goal: state.learnerGoal,
    levelSnapshot: "A2",
    stateJson: JSON.stringify(state),
    summary: null,
    startedAt: new Date("2026-09-10T10:00:00.000Z"),
    updatedAt: new Date("2026-09-10T10:00:00.000Z"),
    completedAt: null,
    lesson: null,
    turns: [],
    evidence: [],
    interventions: [],
  };
  mocks.snapshot.mockResolvedValue(snapshot);
  mocks.record.mockResolvedValue(snapshot);
  mocks.learner.mockResolvedValue({ learnerProfile: null, skillMastery: [], dueVocabulary: [] });
  mocks.recentQuestHistory.mockResolvedValue([]);
  mocks.getMemory.mockResolvedValue(null);
  mocks.mastery.mockResolvedValue(null);
  mocks.evidenceCount.mockResolvedValue(1);
  mocks.memoryRecord.mockImplementation(async () => {
    const result = await database.execute({
      sql: 'SELECT "id", "userId", "goalsJson", "errorsJson", "skillsJson", "preferencesJson" FROM "LearnerMemory" WHERE "userId" = ?',
      args: [userId],
    });
    return result.rows[0] ?? null;
  });
  mocks.planMemory.mockImplementation((
    _id: string,
    existing: {
      goals: unknown[];
      recurringErrors: unknown[];
      provenSkills: Array<{ skillKey: string; masteryScore: number; evidenceCount: number; lastEvidenceId?: string }>;
      preferences: Record<string, unknown>;
    } | null,
    evidence: { id: string; skillKey: string; score: number },
  ) => {
    const priorSkills = existing?.provenSkills ?? [];
    const currentSkill = priorSkills.find((skill) => skill.skillKey === evidence.skillKey);
    const provenSkills = currentSkill
      ? priorSkills.map((skill) => skill.skillKey === evidence.skillKey
        ? { ...skill, masteryScore: Math.max(skill.masteryScore, evidence.score), evidenceCount: skill.evidenceCount + 1, lastEvidenceId: evidence.id }
        : skill)
      : [...priorSkills, { skillKey: evidence.skillKey, masteryScore: evidence.score, evidenceCount: 1, lastEvidenceId: evidence.id }];
    return {
      create: {
        userId,
        goalsJson: JSON.stringify(existing?.goals ?? []),
        errorsJson: JSON.stringify(existing?.recurringErrors ?? []),
        skillsJson: JSON.stringify(provenSkills),
        preferencesJson: JSON.stringify(existing?.preferences ?? {}),
      },
      update: {
        errorsJson: JSON.stringify(existing?.recurringErrors ?? []),
        skillsJson: JSON.stringify(provenSkills),
      },
    };
  });
  mocks.evaluate.mockResolvedValue({
    output: { ...createEvaluateTurnFallback({ state, learnerMessage: "suitcase", template }), shouldComplete: false },
    meta: { provider: "test", model: "test", promptVersion: "test", groundedKnowledgeIds: [] },
  });
  mocks.start.mockResolvedValue({
    opening: createStartMissionFallback(template),
    state,
    meta: { provider: "test", model: "test", promptVersion: "test", groundedKnowledgeIds: [] },
  });
  mocks.atomicBatch.mockImplementation(async (statements: Array<{ sql: string; values?: Array<string | number | null> }>) => {
    const results = await database.batch(
      statements.map((statement) => ({ sql: statement.sql, args: statement.values ?? [] })),
      "write",
    );
    return results.map((result) => ({ changes: Number(result.rowsAffected) }));
  });
});

afterEach(async () => {
  await database?.close();
});

describe("atomic libSQL learning-session persistence", () => {
  it("executes the state-CAS turn graph atomically and stale replay cannot add evidence", async () => {
    await submitLearningTurn(userId, sessionId, {
      clientTurnId: "turn-1",
      content: "suitcase",
      hintCount: 0,
      replayCount: 0,
    });

    const statements = mocks.atomicBatch.mock.calls[0]?.[0] as Array<{
      sql: string;
      values: Array<string | number | null>;
    }>;
    expect(statements[0]?.sql).toContain('"stateJson" = ?');
    expect(statements[0]?.sql).toContain('INSERT INTO "LearningTurn"');
    expect(statements.slice(1).every((statement) => statement.sql.includes('"LearningTurn"'))).toBe(true);

    const [turns, evidence, mastery, memory, interaction, session] = await Promise.all([
      database.execute({ sql: 'SELECT COUNT(*) AS count FROM "LearningTurn"', args: [] }),
      database.execute({ sql: 'SELECT COUNT(*) AS count FROM "LearningEvidence"', args: [] }),
      database.execute({ sql: 'SELECT COUNT(*) AS count FROM "SkillMastery"', args: [] }),
      database.execute({ sql: 'SELECT COUNT(*) AS count FROM "LearnerMemory"', args: [] }),
      database.execute({ sql: 'SELECT COUNT(*) AS count FROM "AIInteraction"', args: [] }),
      database.execute({ sql: 'SELECT "stateJson" FROM "LearningSession" WHERE "id" = ?', args: [sessionId] }),
    ]);
    expect(turns.rows[0]).toMatchObject({ count: 2 });
    expect(evidence.rows[0]).toMatchObject({ count: 1 });
    expect(mastery.rows[0]).toMatchObject({ count: 1 });
    expect(memory.rows[0]).toMatchObject({ count: 1 });
    expect(interaction.rows[0]).toMatchObject({ count: 1 });
    expect(session.rows[0]).not.toMatchObject({ stateJson: JSON.stringify(state) });

    await expect(submitLearningTurn(userId, sessionId, {
      clientTurnId: "turn-1",
      content: "suitcase",
      hintCount: 0,
      replayCount: 0,
    })).rejects.toMatchObject({ code: "SESSION_CONFLICT", status: 409 });
    const staleStatements = mocks.atomicBatch.mock.calls[1]?.[0] as Array<{
      sql: string;
      values: Array<string | number | null>;
    }>;
    expect(staleStatements[0]?.values[0]).not.toBe(statements[0]?.values[0]);
    const afterReplay = await database.execute({
      sql: 'SELECT COUNT(*) AS count FROM "LearningEvidence"',
      args: [],
    });
    expect(afterReplay.rows[0]).toMatchObject({ count: 1 });
  });

  it("derives turn sequences from the database when a stale event snapshot precedes a turn", async () => {
    // The repository mock intentionally remains stale after the event. This
    // reproduces an event and AI turn resolving from the same old snapshot.
    await recordLearningEvent(userId, sessionId, {
      type: "HINT",
      clientEventId: "event-1",
    });

    await expect(submitLearningTurn(userId, sessionId, {
      clientTurnId: "turn-after-event",
      content: "suitcase",
      hintCount: 0,
      replayCount: 0,
    })).resolves.toBeDefined();

    const statements = mocks.atomicBatch.mock.calls[1]?.[0] as Array<{ sql: string }>;
    expect(statements[0]?.sql).toContain('MAX("sequence") + 1');
    expect(statements[1]?.sql).toContain('SELECT "sequence" + 1');

    const turns = await database.execute({
      sql: 'SELECT "sequence", "actor" FROM "LearningTurn" ORDER BY "sequence" ASC',
      args: [],
    });
    expect(turns.rows.map((row) => ({
      sequence: Number(row.sequence),
      actor: String(row.actor),
    }))).toEqual([
     { sequence: 1, actor: "SYSTEM" },
     { sequence: 2, actor: "LEARNER" },
     { sequence: 3, actor: "AI" },
    ]);
  });

  it("retries a stale learner-memory fence so two sessions retain both mastery and memory evidence", async () => {
    const secondSessionId = "session-2";
    await database.execute({
      sql: `INSERT INTO "LearningSession"
        ("id", "userId", "mode", "status", "goal", "levelSnapshot", "stateJson", "startedAt", "updatedAt")
        VALUES (?, ?, 'MISSION', 'ACTIVE', ?, 'A2', ?, ?, ?)`,
      args: [
        secondSessionId,
        userId,
        state.learnerGoal,
        JSON.stringify(state),
        "2026-09-10T10:00:00.000+00:00",
        "2026-09-10T10:00:00.000+00:00",
      ],
    });

    const firstSnapshot = await mocks.snapshot(userId, sessionId);
    const secondSnapshot = { ...firstSnapshot, id: secondSessionId, turns: [] };
    mocks.snapshot.mockImplementation(async (_userId: string, id: string) => (
      structuredClone(id === secondSessionId ? secondSnapshot : firstSnapshot)
    ));
    mocks.record.mockImplementation(async (_userId: string, id: string) => (
      id === secondSessionId ? secondSnapshot : firstSnapshot
    ));

    let memoryReads = 0;
    let releaseFirstRead: (() => void) | undefined;
    mocks.memoryRecord.mockImplementation(async () => {
      memoryReads += 1;
      if (memoryReads === 1) {
        await new Promise<void>((resolve) => { releaseFirstRead = resolve; });
        return null;
      }
      if (memoryReads === 2) {
        releaseFirstRead?.();
        return null;
      }
      const row = await database.execute({
        sql: 'SELECT "id", "userId", "goalsJson", "errorsJson", "skillsJson", "preferencesJson" FROM "LearnerMemory" WHERE "userId" = ?',
        args: [userId],
      });
      return row.rows[0] ?? null;
    });

    await expect(Promise.all([
      submitLearningTurn(userId, sessionId, {
        clientTurnId: "session-1-turn",
        content: "suitcase",
        hintCount: 0,
        replayCount: 0,
      }),
      submitLearningTurn(userId, secondSessionId, {
        clientTurnId: "session-2-turn",
        content: "suitcase",
        hintCount: 0,
        replayCount: 0,
      }),
    ])).resolves.toHaveLength(2);

    const [mastery, memory] = await Promise.all([
      database.execute({
        sql: 'SELECT "masteryScore", "evidenceCount" FROM "SkillMastery" WHERE "userId" = ? AND "skillKey" = ?',
        args: [userId, "communication"],
      }),
      database.execute({
        sql: 'SELECT "skillsJson" FROM "LearnerMemory" WHERE "userId" = ?',
        args: [userId],
      }),
    ]);
    const generated = await mocks.evaluate.mock.results[0]?.value as {
      output: { score: number; confidence: number };
    };
    const rate = 0.18 * generated.output.confidence;
    const afterOne = 0.5 + (generated.output.score - 0.5) * rate;
    const afterTwo = afterOne + (generated.output.score - afterOne) * rate;
    expect(mastery.rows[0]).toMatchObject({ evidenceCount: 2 });
    expect(Number(mastery.rows[0]?.masteryScore)).toBeCloseTo(afterTwo);
    const skills = JSON.parse(String(memory.rows[0]?.skillsJson)) as Array<{
      skillKey: string;
      evidenceCount: number;
    }>;
    expect(skills).toContainEqual(expect.objectContaining({
      skillKey: "communication",
      evidenceCount: 2,
    }));
    expect(mocks.atomicBatch).toHaveBeenCalledTimes(3);
  });
});
