import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient, type Client, type InStatement } from "@libsql/client";
import {
  applyPrismaMigrations,
  deriveSchemaContract,
  listPrismaMigrations,
  type SchemaContract,
  parseMigrationVerifierCli,
  verifyMigration,
} from "../../scripts/verify-turso-migration";

/**
 * Plan13 SPEC-P134 §1: the expected schema is derived from
 * `prisma/migrations/**` at run time, so these tests never hard-code table,
 * index, or foreign-key counts. Fixtures are built with the same
 * `applyPrismaMigrations()` the verifier itself uses.
 */

const FIXTURE_TIMESTAMP = "2026-09-10T12:00:00.000Z";
// Contract derivation + two full fingerprints normally take ~1 s, but shared
// Windows runners under load have been observed 30x slower.
const TEST_TIMEOUT_MS = 60_000;

let fixtureDirectory = "";
let sourceUrl = "";
let targetUrl = "";
let contract: SchemaContract;

function databaseUrl(fileName: string) {
  return pathToFileURL(path.join(fixtureDirectory, fileName)).href;
}

async function createFixture(fileName: string) {
  const url = databaseUrl(fileName);
  const client = createClient({ url });
  try {
    await applyPrismaMigrations(client);

    const statements: InStatement[] = [
      {
        sql: `INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "user-1",
          "Fixture teacher",
          "teacher@fixture.invalid",
          "fixture-hash",
          "TEACHER",
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        ],
      },
      {
        sql: `INSERT INTO "Course" ("id", "title", "createdById", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        args: ["course-1", "Fixture course", "user-1", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP],
      },
    ];

    for (let lessonIndex = 1; lessonIndex <= 3; lessonIndex += 1) {
      statements.push({
        sql: `INSERT INTO "Lesson" ("id", "courseId", "title", "topic", "transcript", "createdById", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `lesson-${lessonIndex}`,
          "course-1",
          `Lesson ${lessonIndex}`,
          "fixture",
          "fixture transcript",
          "user-1",
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        ],
      });
    }

    for (let vocabularyIndex = 1; vocabularyIndex <= 12; vocabularyIndex += 1) {
      const vocabularyId = `vocabulary-${vocabularyIndex}`;
      statements.push({
        sql: `INSERT INTO "VocabularyItem" ("id", "lemma", "displayText", "meaningVi") VALUES (?, ?, ?, ?)`,
        args: [vocabularyId, `lemma-${vocabularyIndex}`, `Word ${vocabularyIndex}`, "fixture meaning"],
      });
      statements.push({
        sql: `INSERT INTO "LessonVocabulary" ("lessonId", "vocabularyItemId") VALUES (?, ?)`,
        args: [`lesson-${((vocabularyIndex - 1) % 3) + 1}`, vocabularyId],
      });
    }

    await client.batch(statements, "write");
  } finally {
    client.close();
  }
  return url;
}

function targetClient(): Client {
  return createClient({ url: targetUrl });
}

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(
    path.join(os.tmpdir(), "listenai-migration-verifier-"),
  );
  contract = await deriveSchemaContract();
  sourceUrl = await createFixture("source.db");
  targetUrl = await createFixture("target.db");
}, 60_000);

afterAll(async () => {
  if (!fixtureDirectory) return;
  try {
    await rm(fixtureDirectory, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  } catch {
    // Windows may still hold a libSQL transaction handle until GC (EBUSY);
    // a leftover temp fixture directory is harmless and must not fail the run.
  }
});

describe("Plan13 migration-contract verifier", () => {
  it("accepts only explicit migration-scoped environment URLs and a target-only run", () => {
    expect(
      parseMigrationVerifierCli([], {
        MIGRATION_SOURCE_DATABASE_URL: "file:./source.db",
        MIGRATION_TARGET_DATABASE_URL: "file:./target.db",
      }),
    ).toMatchObject({
      source: { url: "file:./source.db" },
      target: { url: "file:./target.db" },
    });

    expect(
      parseMigrationVerifierCli(["--target-url", "file:./target.db"], {}),
    ).toEqual({ target: { url: "file:./target.db" } });

    expect(parseMigrationVerifierCli(["--self-test"], {})).toEqual({
      selfTest: true,
    });

    expect(() => parseMigrationVerifierCli([], {})).toThrow(/target URL is required/i);
  });

  it("rejects malformed endpoints without exposing embedded credentials", async () => {
    const secret = "not-for-output";
    let failure: unknown;
    try {
      await verifyMigration({
        source: { url: `libsql://user:${secret}@invalid.example` },
        target: { url: targetUrl },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(secret);
  });

  it(
    "derives the contract from prisma/migrations and passes on freshly migrated fixtures",
    async () => {
      const migrations = await listPrismaMigrations();
      const report = await verifyMigration({
        source: { url: sourceUrl },
        target: { url: targetUrl },
        contract,
      });

      expect(report.status).toBe("passed");
      expect(report.comparison).toEqual({ passed: true, mismatches: [] });
      expect(report.contract.migrations).toEqual(migrations);
      expect(report.contract.tableCount).toBeGreaterThan(0);
      expect(report.contract.namedIndexCount).toBeGreaterThan(0);
      expect(report.contract.foreignKeyCount).toBeGreaterThan(0);

      // Derived counts, never literal expectations.
      expect(report.target.applicationTables).toMatchObject({
        expectedCount: report.contract.tableCount,
        missingExpected: [],
        unexpected: [],
        matchesExpected: true,
      });
      expect(report.target.applicationTables.actual).toHaveLength(
        report.contract.tableCount,
      );
      expect(report.target.namedIndexes).toMatchObject({
        expectedCount: report.contract.namedIndexCount,
        matchesExpected: true,
        semanticSignature: report.contract.indexSignature,
      });
      expect(report.target.schema.foreignKeys).toHaveLength(
        report.contract.foreignKeyCount,
      );
      expect(report.target.schema.semanticSignature).toBe(
        report.contract.schemaSignature,
      );
      expect(report.target.integrity).toEqual({
        foreignKeyViolationCount: "0",
        integrityCheckOk: true,
        quickCheckOk: true,
      });
      expect(report.target.tableCounts.VocabularyItem).toBe("12");
      expect(report.target.tableCounts.LessonVocabulary).toBe("12");

      expect(report.source).not.toBeNull();
      expect(report.source?.applicationTables.matchesExpected).toBe(true);
      expect(report.source?.tableCounts).toEqual(report.target.tableCounts);
      expect(report.stagingTimestampProbe).toMatchObject({ status: "not-run" });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "verifies a target alone and reports source as null",
    async () => {
      const report = await verifyMigration({ target: { url: targetUrl }, contract });

      expect(report.status).toBe("passed");
      expect(report.source).toBeNull();
      expect(report.target.applicationTables.matchesExpected).toBe(true);
      expect(report.coverage.performed.join("\n")).toMatch(/no source database supplied/i);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "ignores only the engine bookkeeping tables",
    async () => {
      const sourceClient = createClient({ url: sourceUrl });
      const target = targetClient();
      try {
        await Promise.all([
          sourceClient.execute(
            `CREATE TABLE IF NOT EXISTS "d1_migrations" ("name" TEXT PRIMARY KEY)`,
          ),
          target.execute(
            `CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" TEXT PRIMARY KEY)`,
          ),
        ]);

        const report = await verifyMigration({
          source: { url: sourceUrl },
          target: { url: targetUrl },
          contract,
        });

        expect(report.status).toBe("passed");
        expect(report.source?.applicationTables.actual).not.toContain("d1_migrations");
        expect(report.target.applicationTables.actual).not.toContain("_prisma_migrations");
        expect(report.target.applicationTables.matchesExpected).toBe(true);
      } finally {
        sourceClient.close();
        target.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it("is unconditionally read-only and rejects legacy probe activation", () => {
    const parsed = parseMigrationVerifierCli([], {
      MIGRATION_SOURCE_DATABASE_URL: "file:./source.db",
      MIGRATION_TARGET_DATABASE_URL: "file:./target.db",
      MIGRATION_ENABLE_STAGING_PROBE: "1",
      MIGRATION_TARGET_ENVIRONMENT: "staging",
    });

    expect(parsed).not.toHaveProperty("runStagingProbe");
    expect(() =>
      parseMigrationVerifierCli([
        "--source-url", "file:./source.db",
        "--target-url", "file:./target.db",
        "--staging-probe",
      ]),
    ).toThrow(/unsupported migration-verifier argument/i);
  });

  it("rejects a libSQL/HTTPS alias of the same remote endpoint", async () => {
    await expect(
      verifyMigration({
        source: { url: "libsql://same-target.example" },
        target: { url: "https://same-target.example" },
      }),
    ).rejects.toThrow(/Source and target must be distinct/i);
  });

  it("rejects file URL spellings of the same Windows endpoint", async () => {
    const nativePathUrl = `file:${fileURLToPath(sourceUrl).replaceAll("\\", "/")}`;

    await expect(
      verifyMigration({
        source: { url: sourceUrl },
        target: { url: nativePathUrl },
      }),
    ).rejects.toThrow(/Source and target must be distinct/i);
  });

  it(
    "detects a dropped index, an extra column, and a redacted primary-key/count drift",
    async () => {
      const client = targetClient();
      let droppedIndex = "";
      try {
        const indexRow = await client.execute(
          `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' AND tbl_name = 'Lesson' ORDER BY name LIMIT 1`,
        );
        droppedIndex = String(indexRow.rows[0]?.name ?? "");
        expect(droppedIndex).not.toBe("");
        await client.execute(`DROP INDEX "${droppedIndex}"`);
        await client.execute(`ALTER TABLE "Course" ADD COLUMN "driftColumn" TEXT`);
        await client.execute({
          sql: `INSERT INTO "VocabularyItem" ("id", "lemma", "displayText", "meaningVi") VALUES (?, ?, ?, ?)`,
          args: ["unexpected-vocabulary", "unexpected-lemma", "Unexpected", "fixture meaning"],
        });
      } finally {
        client.close();
      }

      const report = await verifyMigration({
        source: { url: sourceUrl },
        target: { url: targetUrl },
        contract,
      });

      expect(report.status).toBe("failed");
      expect(report.target.namedIndexes.missingExpected).toEqual([droppedIndex]);
      expect(report.comparison.mismatches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "NAMED_INDEX_SET", subject: "target" }),
          expect.objectContaining({ code: "SEMANTIC_SCHEMA", subject: "target", target: "Course" }),
          expect.objectContaining({ code: "TABLE_COUNT", subject: "VocabularyItem" }),
          expect.objectContaining({ code: "PRIMARY_KEY_FINGERPRINT", subject: "VocabularyItem" }),
        ]),
      );
      // The untouched source still satisfies the contract.
      expect(
        report.comparison.mismatches.filter((mismatch) => mismatch.subject === "source"),
      ).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
