import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";

const mocks = vi.hoisted(() => ({
  nativeD1: vi.fn(),
  reservations: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  getNativeD1Database: mocks.nativeD1,
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
  evaluateAICallBudget,
  reserveUserAICall,
  settleUserAICall,
} from "./request-budget";

const now = new Date("2026-09-10T04:00:00.000Z");
let database: ReturnType<typeof createClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.nativeD1.mockReturnValue(undefined);
  database = createClient({ url: "file::memory:" });
  await database.execute(`CREATE TABLE "AIInteraction" (
    "id" TEXT PRIMARY KEY, "userId" TEXT, "purpose" TEXT NOT NULL,
    "provider" TEXT, "model" TEXT, "inputHash" TEXT,
    "fallbackReason" TEXT, "schemaValid" INTEGER NOT NULL,
    "success" INTEGER NOT NULL, "traceId" TEXT, "createdAt" TEXT NOT NULL
  )`);
  mocks.reservations.mockImplementation(async () => {
    const result = await database.execute({
      sql: `SELECT "createdAt", "fallbackReason" FROM "AIInteraction"
            WHERE "purpose" = 'ai_call_reservation'
            ORDER BY "createdAt" DESC`,
      args: [],
    });
    return result.rows.map((row) => ({
      createdAt: new Date(String(row.createdAt)),
      fallbackReason: row.fallbackReason === null ? null : String(row.fallbackReason),
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
    ).toMatchObject({ allowed: false, reason: "ACTIVE", retryAfterSeconds: 28 });
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

  it("uses a single native-D1 conditional reservation so parallel calls cannot both reach Kira", async () => {
    const binding = {
      prepare(sql: string) {
        return {
          bind(...values: Array<string | number | null>) {
            return { sql, values };
          },
        };
      },
      async batch(statements: Array<{ sql: string; values: Array<string | number | null> }>) {
        const results = await database.batch(
          statements.map((statement) => ({ sql: statement.sql, args: statement.values })),
          "write",
        );
        return results.map((result) => ({
          success: true,
          meta: { changes: Number(result.rowsAffected) },
        }));
      },
    };
    mocks.nativeD1.mockReturnValue(binding);

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

    await settleUserAICall(first, {
      success: true,
      provider: "kira",
      model: "glm-5.3-flash-free",
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
