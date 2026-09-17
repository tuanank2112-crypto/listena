import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";

const mocks = vi.hoisted(() => ({
  atomicClient: vi.fn(),
  reservations: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  getAtomicLibSqlClient: mocks.atomicClient,
  toLibSqlTimestamp: (value: Date) => value.toISOString().replace("Z", "+00:00"),
  prisma: {
    aIInteraction: {
      findMany: mocks.reservations,
      create: mocks.create,
      updateMany: mocks.update,
    },
  },
}));

import {
  AI_REQUEST_DAILY_LIMIT,
  AI_REQUEST_MIN_INTERVAL_MS,
  AI_REQUEST_PENDING_LEASE_MS,
  evaluateAICallBudget,
  reserveUserAICall,
  settleUserAICall,
} from "./request-budget";

const now = new Date("2026-09-10T04:00:00.000Z");
let database: ReturnType<typeof createClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  mocks.atomicClient.mockReturnValue(database);
  await database.execute(`CREATE TABLE "AIInteraction" (
    "id" TEXT PRIMARY KEY, "userId" TEXT, "purpose" TEXT NOT NULL,
    "provider" TEXT, "model" TEXT, "inputHash" TEXT,
    "fallbackReason" TEXT, "schemaValid" INTEGER NOT NULL,
    "success" INTEGER NOT NULL, "traceId" TEXT, "createdAt" TEXT NOT NULL,
    "leaseExpiresAt" TEXT
  )`);
  mocks.reservations.mockImplementation(async () => {
    const result = await database.execute({
      sql: `SELECT "createdAt", "fallbackReason", "leaseExpiresAt" FROM "AIInteraction"
            WHERE "purpose" = 'ai_call_reservation'
            ORDER BY "createdAt" DESC`,
      args: [],
    });
    return result.rows.map((row) => ({
      createdAt: new Date(String(row.createdAt)),
      fallbackReason: row.fallbackReason === null ? null : String(row.fallbackReason),
      leaseExpiresAt: row.leaseExpiresAt === null ? null : new Date(String(row.leaseExpiresAt)),
    }));
  });
});

afterEach(async () => {
  await database?.close();
});

describe("evaluateAICallBudget", () => {
  it("allows a learner's first live AI request", () => {
    expect(evaluateAICallBudget([], now)).toEqual({ allowed: true });
  });

  it("blocks a second request while an upstream reservation is still pending", () => {
    expect(
      evaluateAICallBudget(
        [
          {
            createdAt: new Date(now.getTime() - 2_000),
            fallbackReason: "AI_CALL_PENDING:evaluate_turn",
          },
        ],
        now,
      ),
    ).toMatchObject({ allowed: false, reason: "ACTIVE", retryAfterSeconds: 208 });
  });

  // Plan13 SPEC-P131 §1 (AI1): the lease must outlast a 180s provider call.
  it("holds a pending lease for 210 seconds so a running 180s call is never double-billed", () => {
    expect(AI_REQUEST_PENDING_LEASE_MS).toBe(210_000);
    const rows = [
      {
        createdAt: new Date(now.getTime() - 31_000),
        fallbackReason: "AI_CALL_PENDING:start_mission",
        leaseExpiresAt: new Date(now.getTime() - 31_000 + AI_REQUEST_PENDING_LEASE_MS),
      },
    ];
    expect(evaluateAICallBudget(rows, now, "start_mission")).toMatchObject({
      allowed: false,
      reason: "ACTIVE",
      retryAfterSeconds: 179,
    });
    expect(
      evaluateAICallBudget(rows, new Date(now.getTime() + 180_000), "start_mission"),
    ).toEqual({ allowed: true });
  });

  it("prefers the explicit lease expiry over createdAt and falls back for legacy rows", () => {
    const explicit = [
      {
        createdAt: new Date(now.getTime() - 200_000),
        fallbackReason: "AI_CALL_PENDING:evaluate_turn",
        leaseExpiresAt: new Date(now.getTime() + 5_000),
      },
    ];
    expect(evaluateAICallBudget(explicit, now, "evaluate_turn")).toMatchObject({
      allowed: false,
      reason: "ACTIVE",
      retryAfterSeconds: 5,
    });
    const legacy = [
      {
        createdAt: new Date(now.getTime() - 211_000),
        fallbackReason: "AI_CALL_PENDING:evaluate_turn",
        leaseExpiresAt: null,
      },
    ];
    expect(evaluateAICallBudget(legacy, now, "evaluate_turn")).toEqual({ allowed: true });
  });

  it("enforces a server-side cooldown after a settled call", () => {
    const result = evaluateAICallBudget(
      [
        {
          createdAt: new Date(now.getTime() - AI_REQUEST_MIN_INTERVAL_MS + 1_000),
          fallbackReason: "AI_CALL_SUCCEEDED:dataset_tutor",
        },
      ],
      now,
      "dataset_tutor",
    );
    expect(result).toMatchObject({ allowed: false, reason: "COOLDOWN", retryAfterSeconds: 1 });
  });

  it("lets a learning-loop CTA and its conversational turn continue immediately", () => {
    const rows = [
      {
        createdAt: new Date(now.getTime() - 1_000),
        fallbackReason: "AI_CALL_SUCCEEDED:start_mission",
      },
    ];
    expect(evaluateAICallBudget(rows, now, "start_mission")).toEqual({ allowed: true });
    expect(evaluateAICallBudget(rows, now, "evaluate_turn")).toEqual({ allowed: true });
  });

  it("caps every live AI purpose together in one rolling day", () => {
    const result = evaluateAICallBudget(
      Array.from({ length: AI_REQUEST_DAILY_LIMIT }, (_, index) => ({
        createdAt: new Date(now.getTime() - (index + 1) * 60_000),
        fallbackReason: "AI_CALL_SUCCEEDED:lesson_tutor",
      })),
      now,
    );
    expect(result).toMatchObject({ allowed: false, reason: "DAILY_LIMIT" });
  });

  it("uses a single conditional libSQL reservation so parallel calls cannot both reach the provider", async () => {

    const first = await reserveUserAICall({
      userId: "learner-1",
      purpose: "personalized_lesson",
      requestIdentity: "request-1",
      now,
    });
    await expect(reserveUserAICall({
      userId: "learner-1",
      purpose: "evaluate_turn",
      requestIdentity: "request-2",
      now,
    })).rejects.toMatchObject({ code: "AI_REQUEST_LIMIT", status: 429 });

    const stored = await database.execute({
      sql: `SELECT "purpose", "fallbackReason", "success" FROM "AIInteraction"`,
      args: [],
    });
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      purpose: "ai_call_reservation",
      fallbackReason: "AI_CALL_PENDING:personalized_lesson",
      success: 0,
    });
    const lease = await database.execute({
      sql: `SELECT "leaseExpiresAt" FROM "AIInteraction"`,
      args: [],
    });
    expect(String(lease.rows[0]?.leaseExpiresAt)).toBe(
      new Date(now.getTime() + AI_REQUEST_PENDING_LEASE_MS).toISOString().replace("Z", "+00:00"),
    );

    // The atomic insert fence itself honours the 210s lease: a second call at
    // t+31s is refused, one at t+211s is accepted (SPEC-P131 §1 test).
    await expect(reserveUserAICall({
      userId: "learner-1",
      purpose: "evaluate_turn",
      requestIdentity: "request-2b",
      now: new Date(now.getTime() + 31_000),
    })).rejects.toMatchObject({ code: "AI_REQUEST_LIMIT", details: { reason: "app_request_limited" } });
    await expect(reserveUserAICall({
      userId: "learner-1",
      purpose: "evaluate_turn",
      requestIdentity: "request-2c",
      now: new Date(now.getTime() + 211_000),
    })).resolves.toMatchObject({ purpose: "evaluate_turn" });
    await database.execute({
      sql: `DELETE FROM "AIInteraction" WHERE "fallbackReason" = 'AI_CALL_PENDING:evaluate_turn'`,
      args: [],
    });

    await settleUserAICall(first, {
      success: true,
      provider: "vyce",
      model: "claude-sonnet-4-6",
    });
    const settled = await database.execute({
      sql: `SELECT "fallbackReason", "success", "schemaValid" FROM "AIInteraction"`,
      args: [],
    });
    expect(settled.rows[0]).toMatchObject({
      fallbackReason: "AI_CALL_SUCCEEDED:personalized_lesson",
      success: 1,
      schemaValid: 1,
    });

    await expect(reserveUserAICall({
      userId: "learner-1",
      purpose: "evaluate_turn",
      requestIdentity: "request-3",
      now,
    })).resolves.toMatchObject({ purpose: "evaluate_turn" });
  });
});
