import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  memory: vi.fn(),
  profile: vi.fn(),
  batch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    learnerMemory: { findUnique: mocks.memory },
    learnerProfile: { findUnique: mocks.profile },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: mocks.batch,
  libSqlTimestamp: (value: Date) => value.getTime(),
}));
import {
  LearnerIntentError,
  LearnerIntentSchema,
  buildLearnerIntentStatements,
  toLearnerIntent,
  updateLearnerIntent,
} from "./learner-intent";

const baseMemory = {
  id: "memory-1",
  userId: "learner-1",
  goalsJson: "[]",
  errorsJson: "[]",
  skillsJson: "[]",
  preferencesJson: JSON.stringify({ selfStudyGoal: "Travel confidently", dailyMinutes: 15, preferredTopics: ["travel", "food"] }),
};

describe("learner intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.memory.mockResolvedValue(baseMemory);
    mocks.profile.mockResolvedValue({ preferredTopics: "travel,food" });
    mocks.batch.mockResolvedValue([{ changes: 1 }, { changes: 1 }]);
  });

  it("uses legacy topics only until the learner has explicitly saved topics", () => {
    expect(toLearnerIntent(null, { preferredTopics: "travel, food, travel" })).toEqual({
      goal: null,
      dailyMinutes: 10,
      preferredTopics: ["travel", "food"],
      revision: null,
    });
    expect(toLearnerIntent(baseMemory, { preferredTopics: "music" })).toMatchObject({
      goal: "Travel confidently",
      dailyMinutes: 15,
      preferredTopics: ["travel", "food"],
    });
  });

  it("validates bounded, unique learner input", () => {
    expect(LearnerIntentSchema.safeParse({
      goal: "Speak with colleagues",
      dailyMinutes: 10,
      preferredTopics: ["work", "Work"],
      revision: "revision",
    }).success).toBe(false);
    expect(LearnerIntentSchema.safeParse({
      goal: null,
      dailyMinutes: 15,
      preferredTopics: ["work", "travel"],
      revision: null,
    }).success).toBe(true);
  });

  it("uses an exact memory snapshot fence and updates the legacy topic compatibility field", () => {
    const statements = buildLearnerIntentStatements({
      userId: "learner-1",
      memory: baseMemory,
      nextPreferencesJson: JSON.stringify({ dailyMinutes: 10 }),
      preferredTopics: ["travel", "food"],
      now: new Date("2026-09-13T00:00:00.000Z"),
    });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain('"goalsJson" = ?');
    expect(statements[0]?.values).toContain(baseMemory.preferencesJson);
    expect(statements[1]?.sql).toContain('SELECT 1 FROM "LearnerMemory"');
    expect(statements[1]?.values?.slice(0, 5)).toEqual([
      "travel,food",
      expect.anything(),
      "learner-1",
      "learner-1",
      "memory-1",
    ]);
  });

  it("builds a conditional insert for first-time intent", () => {
    const statements = buildLearnerIntentStatements({
      userId: "learner-1",
      memory: null,
      nextPreferencesJson: "{}",
      preferredTopics: [],
      now: new Date("2026-09-13T00:00:00.000Z"),
    });
    expect(statements[0]?.sql).toContain('WHERE NOT EXISTS');
    expect(statements[0]?.values?.[1]).toBe("learner-1");
  });

  it("exposes typed conflict/capacity errors to API callers", () => {
    const error = new LearnerIntentError("changed", "INTENT_CONFLICT");
    expect(error).toMatchObject({ code: "INTENT_CONFLICT", status: 409 });
  });

  it("persists only the declared intent while preserving unrelated preferences", async () => {
    mocks.memory.mockResolvedValue({
      ...baseMemory,
      preferencesJson: JSON.stringify({ pace: "slow", selfStudyGoal: "old", dailyMinutes: 5 }),
    });
    const current = toLearnerIntent(await mocks.memory(), { preferredTopics: "" });
    const updated = await updateLearnerIntent("learner-1", {
      goal: "Speak at work",
      dailyMinutes: 20,
      preferredTopics: ["work"],
      revision: current.revision,
    });

    expect(updated).toMatchObject({ goal: "Speak at work", dailyMinutes: 20, preferredTopics: ["work"] });
    const statements = mocks.batch.mock.calls[0]?.[0] as Array<{ values: unknown[] }>;
    expect(statements[0]?.values?.[0]).toContain('"pace":"slow"');
    expect(statements[1]?.values?.[0]).toBe("work");
  });

  it("reports a revision conflict after a failed conditional write", async () => {
    const current = toLearnerIntent(baseMemory, { preferredTopics: "" });
    mocks.batch.mockResolvedValue([{ changes: 0 }, { changes: 0 }]);
    await expect(updateLearnerIntent("learner-1", {
      goal: null,
      dailyMinutes: 10,
      preferredTopics: [],
      revision: current.revision,
    })).rejects.toMatchObject({ code: "INTENT_CONFLICT" });
  });
});
