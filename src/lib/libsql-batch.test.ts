import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";

const mocks = vi.hoisted(() => ({
  atomicClient: vi.fn(),
  timestamp: vi.fn((value: Date) => value.getTime()),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  getAtomicLibSqlClient: mocks.atomicClient,
  toLibSqlTimestamp: mocks.timestamp,
}));

import {
  DatabaseUnavailableError,
  executeAtomicLibSqlBatch,
  isDatabaseUnavailableError,
  libSqlTimestamp,
} from "./libsql-batch";

let database: ReturnType<typeof createClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  mocks.atomicClient.mockReturnValue(database);
  await database.execute(`CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE
  )`);
});

afterEach(async () => {
  await database?.close();
});

describe("executeAtomicLibSqlBatch", () => {
  it("rolls back an earlier local SQLite write when a later statement fails", async () => {
    await expect(executeAtomicLibSqlBatch([
     { sql: "INSERT INTO entries (slug) VALUES (?)", values: ["first"] },
     { sql: "INSERT INTO entries (slug) VALUES (?)", values: ["first"] },
    ])).rejects.toThrow(/UNIQUE constraint failed/i);

    const rows = await database.execute("SELECT id, slug FROM entries");
    expect(rows.rows).toEqual([]);
  });

  it("normalizes affected rows and delegates timestamp representation to Prisma config", async () => {
    await expect(executeAtomicLibSqlBatch([
      { sql: "INSERT INTO entries (slug) VALUES (?)", values: ["first"] },
    ])).resolves.toEqual([{ changes: 1 }]);

    expect(libSqlTimestamp(new Date("2026-09-10T00:00:00.000Z"))).toBe(
      new Date("2026-09-10T00:00:00.000Z").getTime(),
    );
  });

  it("wraps operational batch rejections without leaking the driver message", async () => {
    const driverError = new Error("connection failed for authToken=secret-token");
    mocks.atomicClient.mockReturnValue({
      batch: vi.fn().mockRejectedValue(driverError),
    });

    let caught: unknown;
    try {
      await executeAtomicLibSqlBatch([
        { sql: "INSERT INTO entries (slug) VALUES (?)", values: ["first"] },
      ]);
    } catch (error) {
      caught = error;
    }

    expect(isDatabaseUnavailableError(caught)).toBe(true);
    expect(caught).toBeInstanceOf(DatabaseUnavailableError);
    expect((caught as Error).message).toBe("Database is temporarily unavailable.");
    expect((caught as Error).message).not.toContain("secret-token");
    expect((caught as Error & { cause?: unknown }).cause).toBeUndefined();
  });
});
