import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  executeAtomicBatch: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: mocks.executeAtomicBatch,
  libSqlTimestamp: (value: Date) => value.getTime(),
}));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/logger", () => ({ default: { info: mocks.info, error: mocks.error } }));

import { POST } from "./route";

let database: ReturnType<typeof createClient>;

async function request(body: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Lan",
      email: "lan@example.com",
      password: "safe-pass",
      ...body,
    }),
  }));
}

async function rowCount(table: "User" | "LearnerProfile" | "SkillMastery") {
  const result = await database.execute(`SELECT COUNT(*) AS "count" FROM "${table}"`);
  return Number((result.rows[0] as unknown as { count: unknown }).count);
}

async function assertNoAccountRows() {
  await expect(rowCount("User")).resolves.toBe(0);
  await expect(rowCount("LearnerProfile")).resolves.toBe(0);
  await expect(rowCount("SkillMastery")).resolves.toBe(0);
}

async function addInsertionFault(point: "user" | "profile" | string) {
  const trigger = point === "user"
    ? `CREATE TRIGGER "fail_registration_user"
         BEFORE INSERT ON "User"
         BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`
    : point === "profile"
      ? `CREATE TRIGGER "fail_registration_profile"
           BEFORE INSERT ON "LearnerProfile"
           BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`
      : `CREATE TRIGGER "fail_registration_${point}"
           BEFORE INSERT ON "SkillMastery"
           WHEN NEW."skillKey" = '${point}'
           BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`;
  await database.execute(trigger);
}

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  await database.batch([
    { sql: "PRAGMA foreign_keys = ON", args: [] },
    {
      sql: `CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL, "role" TEXT NOT NULL,
        "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE "LearnerProfile" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE,
        "estimatedCefrLevel" TEXT NOT NULL, "listeningMastery" REAL NOT NULL,
        "vocabularyMastery" REAL NOT NULL, "spellingMastery" REAL NOT NULL,
        "lastActivityAt" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE "SkillMastery" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "skillKey" TEXT NOT NULL,
        "masteryScore" REAL NOT NULL, "evidenceCount" INTEGER NOT NULL,
        "lastUpdatedAt" INTEGER NOT NULL,
        UNIQUE("userId", "skillKey"),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )`,
      args: [],
    },
  ], "write");
  mocks.findUnique.mockResolvedValue(null);
  mocks.hash.mockResolvedValue("bcrypt-hash");
  mocks.executeAtomicBatch.mockImplementation(async (statements: Array<{
    sql: string;
    values?: Array<string | number | null>;
  }>) => {
    const results = await database.batch(
      statements.map(({ sql, values = [] }) => ({ sql, args: values })),
      "write",
    );
    return results.map((result) => ({ changes: Number(result.rowsAffected) }));
  });
});

afterEach(async () => {
  await database?.close();
});

describe("POST /api/register", () => {
  it("creates exactly one complete learner graph in one atomic batch and ignores a submitted role", async () => {
    const response = await request({ role: "TEACHER" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      name: "Lan",
      email: "lan@example.com",
      role: "LEARNER",
    });
    expect(mocks.hash).toHaveBeenCalledWith("safe-pass", 12);
    expect(mocks.executeAtomicBatch).toHaveBeenCalledTimes(1);
    expect(mocks.executeAtomicBatch.mock.calls[0]?.[0]).toHaveLength(8);
    await expect(rowCount("User")).resolves.toBe(1);
    await expect(rowCount("LearnerProfile")).resolves.toBe(1);
    await expect(rowCount("SkillMastery")).resolves.toBe(6);

    const user = await database.execute('SELECT "role", "password" FROM "User"');
    expect(user.rows[0]).toMatchObject({ role: "LEARNER", password: "bcrypt-hash" });
  });

  it.each([
    "user",
    "profile",
    "listening",
    "vocabulary",
    "spelling",
    "function_words",
    "segmentation",
    "final_sounds",
  ] as const)("rolls back the entire account graph when the %s insert fails", async (point) => {
    await addInsertionFault(point);

    const response = await request();

    expect(response.status).toBe(500);
    await assertNoAccountRows();
  });

  it("maps a same-email race to one successful complete account and one conflict", async () => {
    const responses = await Promise.all([request(), request()]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    await expect(rowCount("User")).resolves.toBe(1);
    await expect(rowCount("LearnerProfile")).resolves.toBe(1);
    await expect(rowCount("SkillMastery")).resolves.toBe(6);
  });

  it("returns a conflict without starting a batch when the email already exists", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing-user" });

    const response = await request();

    expect(response.status).toBe(409);
    expect(mocks.executeAtomicBatch).not.toHaveBeenCalled();
  });

  it("returns an opaque 503 when persistence is unavailable", async () => {
    mocks.findUnique.mockRejectedValue(new DatabaseUnavailableError());

    const response = await request();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
