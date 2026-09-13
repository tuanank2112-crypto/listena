import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260913000000_add_learning_session_start_requests/migration.sql",
);
const primaryFenceMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260913010000_add_primary_learning_session_start_fence/migration.sql",
);
const timestamp = "2026-09-13T00:00:00.000+00:00";

let client: Client;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE "LearningSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
    );
  `);
  await client.executeMultiple(await readFile(migrationPath, "utf8"));
  await client.executeMultiple(await readFile(primaryFenceMigrationPath, "utf8"));
});

afterEach(() => client.close());

async function createUser(id: string) {
  await client.execute({ sql: 'INSERT INTO "User" ("id") VALUES (?)', args: [id] });
}

async function claimStart(userId: string, clientStartId: string) {
  return client.execute({
    sql: `INSERT INTO "LearningSessionStartRequest"
            ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
          SELECT ?, ?, ?, ?, 'PENDING', ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM "LearningSessionStartRequest"
            WHERE "userId" = ? AND "clientStartId" = ?
          )
            AND NOT EXISTS (
              SELECT 1 FROM "LearningSessionStartRequest"
              WHERE "userId" = ? AND "status" = 'PENDING'
            )
            AND NOT EXISTS (
              SELECT 1 FROM "LearningSession"
              WHERE "userId" = ? AND "status" = 'ACTIVE'
          )`,
    args: [
      `${userId}-${clientStartId}-${Math.random()}`,
      userId,
      clientStartId,
      "hash",
      timestamp,
      timestamp,
      userId,
      clientStartId,
      userId,
      userId,
    ],
  });
}

async function countRequests() {
  const result = await client.execute('SELECT COUNT(*) AS "count" FROM "LearningSessionStartRequest"');
  return Number(result.rows[0]?.count ?? 0);
}

describe("LearningSessionStartRequest migration", () => {
  it("permits exactly one concurrent claim per user/start key, while different users remain independent", async () => {
    await createUser("learner-a");
    const sameKey = "00000000-0000-4000-8000-000000000201";
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimStart("learner-a", sameKey)),
    );

    expect(claims.filter((result) => result.rowsAffected === 1)).toHaveLength(1);
    expect(await countRequests()).toBe(1);

    await createUser("learner-b");
    const secondUser = await claimStart("learner-b", sameKey);
    expect(secondUser.rowsAffected).toBe(1);
    expect(await countRequests()).toBe(2);
  });

  it("permits only one pending primary start across concurrent distinct keys before any provider call", async () => {
    await createUser("learner-primary");
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, index) => claimStart(
        "learner-primary",
        `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`,
      )),
    );

    expect(claims.filter((result) => result.rowsAffected === 1)).toHaveLength(1);
    const winner = await client.execute({
      sql: `SELECT "id" FROM "LearningSessionStartRequest"
            WHERE "userId" = ? AND "status" = 'PENDING'`,
      args: ["learner-primary"],
    });
    expect(winner.rows).toHaveLength(1);

    await expect(client.execute({
      sql: `INSERT INTO "LearningSessionStartRequest"
              ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
      args: [
        "direct-second-pending",
        "learner-primary",
        "00000000-0000-4000-8000-000000000399",
        "hash",
        timestamp,
        timestamp,
      ],
    })).rejects.toThrow(/UNIQUE constraint failed/i);

    await client.execute({
      sql: `UPDATE "LearningSessionStartRequest"
            SET "status" = 'FAILED' WHERE "id" = ?`,
      args: [String(winner.rows[0]?.id)],
    });
    await expect(claimStart(
      "learner-primary",
      "00000000-0000-4000-8000-000000000400",
    )).resolves.toMatchObject({ rowsAffected: 1 });

    await createUser("learner-active");
    await client.execute({
      sql: 'INSERT INTO "LearningSession" ("id", "userId", "status") VALUES (?, ?, \'ACTIVE\')',
      args: ["already-active", "learner-active"],
    });
    await expect(claimStart(
      "learner-active",
      "00000000-0000-4000-8000-000000000407",
    )).resolves.toMatchObject({ rowsAffected: 0 });
  });

  it("normalizes legacy concurrent pending rows before installing the primary-start index", async () => {
    const legacy = createClient({ url: ":memory:" });
    try {
      await legacy.executeMultiple(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "LearningSession" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
        );
      `);
      await legacy.executeMultiple(await readFile(migrationPath, "utf8"));
      await legacy.batch([
        {
          sql: 'INSERT INTO "User" ("id") VALUES (?)',
          args: ["legacy-user"],
        },
        {
          sql: 'INSERT INTO "User" ("id") VALUES (?)',
          args: ["legacy-tie"],
        },
        {
          sql: 'INSERT INTO "User" ("id") VALUES (?)',
          args: ["legacy-iso"],
        },
      ], "write");
      const localMillis = Date.parse("2026-09-13T00:00:00.000Z");
      await legacy.batch([
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["legacy-old", "legacy-user", "00000000-0000-4000-8000-000000000401", "hash", localMillis, localMillis],
        },
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["legacy-new", "legacy-user", "00000000-0000-4000-8000-000000000402", "hash", localMillis + 60_000, localMillis + 60_000],
        },
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["tie-a", "legacy-tie", "00000000-0000-4000-8000-000000000403", "hash", localMillis, localMillis],
        },
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["tie-b", "legacy-tie", "00000000-0000-4000-8000-000000000404", "hash", localMillis, localMillis],
        },
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["iso-old", "legacy-iso", "00000000-0000-4000-8000-000000000405", "hash", timestamp, "2026-09-13T00:00:00.000+00:00"],
        },
        {
          sql: `INSERT INTO "LearningSessionStartRequest"
                  ("id", "userId", "clientStartId", "payloadHash", "status", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
          args: ["iso-new", "legacy-iso", "00000000-0000-4000-8000-000000000406", "hash", timestamp, "2026-09-13T00:01:00.000+00:00"],
        },
      ], "write");

      await legacy.executeMultiple(await readFile(primaryFenceMigrationPath, "utf8"));
      const rows = await legacy.execute({
        sql: `SELECT "id", "status", "errorCode"
              FROM "LearningSessionStartRequest"
              WHERE "userId" = ? ORDER BY "id" ASC`,
        args: ["legacy-user"],
      });

      expect(rows.rows).toEqual([
        { id: "legacy-new", status: "PENDING", errorCode: null },
        { id: "legacy-old", status: "UNKNOWN", errorCode: "START_OUTCOME_UNKNOWN" },
      ]);
      const tieRows = await legacy.execute({
        sql: `SELECT "id", "status", "errorCode"
              FROM "LearningSessionStartRequest"
              WHERE "userId" = ? ORDER BY "id" ASC`,
        args: ["legacy-tie"],
      });
      expect(tieRows.rows).toEqual([
        { id: "tie-a", status: "UNKNOWN", errorCode: "START_OUTCOME_UNKNOWN" },
        { id: "tie-b", status: "PENDING", errorCode: null },
      ]);
      const isoRows = await legacy.execute({
        sql: `SELECT "id", "status", "errorCode"
              FROM "LearningSessionStartRequest"
              WHERE "userId" = ? ORDER BY "id" ASC`,
        args: ["legacy-iso"],
      });
      expect(isoRows.rows).toEqual([
        { id: "iso-new", status: "PENDING", errorCode: null },
        { id: "iso-old", status: "UNKNOWN", errorCode: "START_OUTCOME_UNKNOWN" },
      ]);
    } finally {
      legacy.close();
    }
  });

  it("retains a committed session reference and still cascades account deletion", async () => {
    await createUser("learner-a");
    await client.execute({
      sql: 'INSERT INTO "LearningSession" ("id", "userId") VALUES (?, ?)',
      args: ["session-a", "learner-a"],
    });
    await client.execute({
      sql: `INSERT INTO "LearningSessionStartRequest"
              ("id", "userId", "clientStartId", "payloadHash", "status", "sessionId", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, 'COMMITTED', ?, ?, ?)`,
      args: [
        "request-a",
        "learner-a",
        "00000000-0000-4000-8000-000000000202",
        "hash",
        "session-a",
        timestamp,
        timestamp,
      ],
    });

    await expect(client.execute({ sql: 'DELETE FROM "LearningSession" WHERE "id" = ?', args: ["session-a"] }))
      .rejects.toThrow(/FOREIGN KEY constraint failed/i);

    await client.execute({ sql: 'DELETE FROM "User" WHERE "id" = ?', args: ["learner-a"] });
    expect(await countRequests()).toBe(0);
  });
});
