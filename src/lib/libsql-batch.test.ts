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
  rowAs,
  shouldSerializeLocally,
  withLibSqlWriteTransaction,
} from "./libsql-batch";

let database: ReturnType<typeof createClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:?cache=shared" });
  mocks.atomicClient.mockReturnValue(database);
  await database.execute("DROP TABLE IF EXISTS entries");
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

describe("withLibSqlWriteTransaction", () => {
  it("commits writes and returns value when the transaction callback succeeds", async () => {
    const result = await withLibSqlWriteTransaction(async (tx) => {
      await tx.execute({ sql: "INSERT INTO entries (slug) VALUES (?)", args: ["tx-success"] });
      return "done";
    });

    expect(result).toBe("done");
    const rows = await database.execute("SELECT slug FROM entries WHERE slug = 'tx-success'");
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].slug).toBe("tx-success");
  });

  it("rolls back all writes when an exception is thrown in the callback", async () => {
    class CustomDomainError extends Error {}

    await expect(
      withLibSqlWriteTransaction(async (tx) => {
        await tx.execute({ sql: "INSERT INTO entries (slug) VALUES (?)", args: ["tx-fail"] });
        throw new CustomDomainError("domain validation failure");
      })
    ).rejects.toThrow(CustomDomainError);

    const rows = await database.execute("SELECT slug FROM entries WHERE slug = 'tx-fail'");
    expect(rows.rows).toEqual([]);
  });

  it("propagates SQL integrity errors directly", async () => {
    await database.execute("INSERT INTO entries (slug) VALUES ('dup')");

    await expect(
      withLibSqlWriteTransaction(async (tx) => {
        await tx.execute({ sql: "INSERT INTO entries (slug) VALUES ('dup')", args: [] });
      })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("wraps operational transaction errors into DatabaseUnavailableError without leaking secrets", async () => {
    const driverError = new Error("authToken=super-secret-token connection closed");
    mocks.atomicClient.mockReturnValue({
      transaction: vi.fn().mockRejectedValue(driverError),
    });

    let caught: unknown;
    try {
      await withLibSqlWriteTransaction(async () => "ok");
    } catch (err) {
      caught = err;
    }

    expect(isDatabaseUnavailableError(caught)).toBe(true);
    expect(caught).toBeInstanceOf(DatabaseUnavailableError);
    expect((caught as Error).message).not.toContain("super-secret-token");
  });
});

describe("rowAs helper", () => {
  it("casts row to desired shape including null, stringified numbers, and bigint", () => {
    type TestShape = {
      id: string;
      nullableCol: string | null;
      strNum: string;
      bigNum: bigint;
    };

    const mockRow = {
      id: "row-123",
      nullableCol: null,
      strNum: "42.5",
      bigNum: BigInt("9007199254740993"),
    } as unknown as import("@libsql/client").Row;

    const casted = rowAs<TestShape>(mockRow);
    expect(casted.id).toBe("row-123");
    expect(casted.nullableCol).toBeNull();
    expect(casted.strNum).toBe("42.5");
    expect(casted.bigNum).toBe(BigInt("9007199254740993"));
  });
});

describe("shouldSerializeLocally (process mutex gating)", () => {
  it("serializes on local relative file SQLite", () => {
    expect(shouldSerializeLocally({ DATABASE_URL: "file:./x.db" })).toBe(true);
  });

  it("serializes on local absolute file SQLite", () => {
    expect(shouldSerializeLocally({ DATABASE_URL: "file:/tmp/x.db" })).toBe(true);
  });

  it("does NOT serialize on hosted Turso with vercel runtime and no DATABASE_URL", () => {
    expect(
      shouldSerializeLocally({
        APP_RUNTIME: "vercel",
        TURSO_DATABASE_URL: "libsql://test-db.turso.io",
        TURSO_AUTH_TOKEN: "valid-turso-token",
      }),
    ).toBe(false);
  });

  it("does NOT serialize and does not throw on invalid/missing environment", () => {
    expect(shouldSerializeLocally({})).toBe(false);
  });
});

