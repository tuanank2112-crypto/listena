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
  nativeD1: vi.fn(),
  nativeBatch: vi.fn(),
  mastery: vi.fn(),
  evidenceCount: vi.fn(),
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
  getNativeD1Database: mocks.nativeD1,
  prisma: {
    skillMastery: { findUnique: mocks.mastery },
    learningEvidence: { count: mocks.evidenceCount },
  },
}));
vi.mock("@/lib/d1-batch", () => ({
  d1Boolean: (value: boolean) => value ? 1 : 0,
  d1Timestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  executeNativeD1Batch: mocks.nativeBatch,
}));

import { submitLearningTurn } from "./service";

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
  mocks.planMemory.mockImplementation((_id: string, _existing: unknown, evidence: { id: string; skillKey: string; score: number }) => ({
    create: {
      userId,
      goalsJson: "[]",
      errorsJson: "[]",
      skillsJson: JSON.stringify([{ skillKey: evidence.skillKey, masteryScore: evidence.score, evidenceCount: 1, lastEvidenceId: evidence.id }]),
      preferencesJson: "{}",
    },
    update: { errorsJson: "[]", skillsJson: "[]" },
  }));
  mocks.evaluate.mockResolvedValue({
    output: { ...createEvaluateTurnFallback({ state, learnerMessage: "suitcase", template }), shouldComplete: false },
    meta: { provider: "test", model: "test", promptVersion: "test", groundedKnowledgeIds: [] },
  });
  mocks.start.mockResolvedValue({
    opening: createStartMissionFallback(template),
    state,
    meta: { provider: "test", model: "test", promptVersion: "test", groundedKnowledgeIds: [] },
  });
  mocks.nativeD1.mockReturnValue({});
  mocks.nativeBatch.mockImplementation(async (statements: Array<{ sql: string; values?: Array<string | number | null> }>) => {
    const results = await database.batch(
      statements.map((statement) => ({ sql: statement.sql, args: statement.values ?? [] })),
      "write",
    );
    return results.map((result) => ({ success: true, meta: { changes: Number(result.rowsAffected) } }));
  });
});

afterEach(async () => {
  await database?.close();
});

describe("native D1 learning-session persistence", () => {
  it("executes the state-CAS turn graph atomically and stale replay cannot add evidence", async () => {
    await submitLearningTurn(userId, sessionId, {
      clientTurnId: "turn-1",
      content: "suitcase",
      hintCount: 0,
      replayCount: 0,
    });

    const statements = mocks.nativeBatch.mock.calls[0]?.[0] as Array<{
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
    const staleStatements = mocks.nativeBatch.mock.calls[1]?.[0] as Array<{
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
});
