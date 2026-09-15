import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";

const mocks = vi.hoisted(() => ({
  executeAtomicBatch: vi.fn(),
  timestamp: (value: Date) => value.getTime(),
}));

vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: mocks.executeAtomicBatch,
  libSqlTimestamp: mocks.timestamp,
}));

import {
  AccountActionTokenInvalidError,
  consumePasswordResetToken,
  consumeVerificationToken,
  hashAccountActionToken,
  issueAccountActionToken,
} from "./account-actions";

let database: ReturnType<typeof createClient>;
const now = new Date("2026-09-15T00:00:00.000Z");

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  await database.batch([
    { sql: "PRAGMA foreign_keys = ON", args: [] },
    {
      sql: `CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY, "password" TEXT NOT NULL,
        "emailVerifiedAt" INTEGER, "updatedAt" INTEGER NOT NULL
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE "AccountActionToken" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "purpose" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" INTEGER NOT NULL,
        "consumedAt" INTEGER, "createdAt" INTEGER NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: "INSERT INTO \"User\" (\"id\", \"password\", \"updatedAt\") VALUES ('user-1', 'old-hash', 0)",
      args: [],
    },
  ], "write");
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

afterEach(async () => database.close());

describe("account action tokens", () => {
  it("stores only a hash and consumes older verification links when it issues a replacement", async () => {
    const first = await issueAccountActionToken({ userId: "user-1", purpose: "VERIFY_EMAIL", now });
    expect(first).toBeDefined();

    const throttled = await issueAccountActionToken({
      userId: "user-1",
      purpose: "VERIFY_EMAIL",
      now: new Date(now.getTime() + 30_000),
    });
    expect(throttled).toBeUndefined();

    const replacement = await issueAccountActionToken({
      userId: "user-1",
      purpose: "VERIFY_EMAIL",
      now: new Date(now.getTime() + 61_000),
    });
    expect(replacement).toBeDefined();

    const tokens = await database.execute(
      'SELECT "tokenHash", "consumedAt" FROM "AccountActionToken" ORDER BY "createdAt"',
    );
    expect(tokens.rows).toHaveLength(2);
    expect(tokens.rows.map((row) => row.tokenHash)).toContain(hashAccountActionToken(first!.rawToken));
    expect(tokens.rows.map((row) => String(row.tokenHash))).not.toContain(first!.rawToken);
    expect(tokens.rows[0]?.consumedAt).not.toBeNull();
    expect(tokens.rows[1]?.consumedAt).toBeNull();
  });

  it("verifies exactly once", async () => {
    const token = await issueAccountActionToken({ userId: "user-1", purpose: "VERIFY_EMAIL", now });
    await consumeVerificationToken(token!.rawToken, new Date(now.getTime() + 1));

    const user = await database.execute('SELECT "emailVerifiedAt" FROM "User" WHERE "id" = \'user-1\'');
    expect(user.rows[0]?.emailVerifiedAt).not.toBeNull();
    await expect(consumeVerificationToken(token!.rawToken, new Date(now.getTime() + 2)))
      .rejects.toBeInstanceOf(AccountActionTokenInvalidError);
  });

  it("changes a password once and rejects replay", async () => {
    const token = await issueAccountActionToken({ userId: "user-1", purpose: "PASSWORD_RESET", now });
    await consumePasswordResetToken({ rawToken: token!.rawToken, passwordHash: "new-hash", now: new Date(now.getTime() + 1) });

    const user = await database.execute('SELECT "password" FROM "User" WHERE "id" = \'user-1\'');
    expect(user.rows[0]?.password).toBe("new-hash");
    await expect(consumePasswordResetToken({ rawToken: token!.rawToken, passwordHash: "second-hash", now: new Date(now.getTime() + 2) }))
      .rejects.toBeInstanceOf(AccountActionTokenInvalidError);
    await expect(database.execute('SELECT "password" FROM "User" WHERE "id" = \'user-1\''))
      .resolves.toMatchObject({ rows: [{ password: "new-hash" }] });
  });
});
