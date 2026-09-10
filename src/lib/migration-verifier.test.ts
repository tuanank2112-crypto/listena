import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient, type Client, type InStatement } from "@libsql/client";
import {
  parseMigrationVerifierCli,
  verifyMigration,
} from "../../scripts/verify-turso-migration";

const CORE_COURSE_ID = "464c2a28-e631-4c2e-80b4-a6e5f5cefcbf";
const SYSTEM_USER_ID = "aed67c1c-b8e4-4ffc-806e-25c65d860c09";
const FIXTURE_TIMESTAMP = "2026-09-10T12:00:00.000Z";

let fixtureDirectory = "";
let sourceUrl = "";
let targetUrl = "";

function databaseUrl(fileName: string) {
  return pathToFileURL(path.join(fixtureDirectory, fileName)).href;
}

async function runMigrationChain(client: Client) {
  for (const migration of [
    "0001_initial_schema.sql",
    "0002_personalized_ai_learning.sql",
    "0003_personalized_generation_guards.sql",
  ]) {
    const sql = await readFile(
      path.join(process.cwd(), "migrations", migration),
      "utf8",
    );
    await client.executeMultiple(sql);
  }
}

async function createFixture(fileName: string) {
  const url = databaseUrl(fileName);
  const client = createClient({ url });
  try {
    await runMigrationChain(client);
    await client.execute("PRAGMA foreign_keys = ON");

    const statements: InStatement[] = [
      {
        sql: `INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          SYSTEM_USER_ID,
          "System curriculum",
          "system-curriculum@listena.invalid",
          "fixture-hash",
          "ADMIN",
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        ],
      },
      {
        sql: `INSERT INTO "Course" ("id", "title", "createdById", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        args: [
          CORE_COURSE_ID,
          "Core course",
          SYSTEM_USER_ID,
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        ],
      },
    ];

    for (let lessonIndex = 1; lessonIndex <= 5; lessonIndex += 1) {
      statements.push({
        sql: `INSERT INTO "Lesson" ("id", "courseId", "title", "topic", "transcript", "createdById", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `lesson-${lessonIndex}`,
          CORE_COURSE_ID,
          `Lesson ${lessonIndex}`,
          "fixture",
          "fixture transcript",
          SYSTEM_USER_ID,
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        ],
      });
    }

    for (let segmentIndex = 1; segmentIndex <= 20; segmentIndex += 1) {
      const lessonIndex = ((segmentIndex - 1) % 5) + 1;
      statements.push({
        sql: `INSERT INTO "LessonSegment" ("id", "lessonId", "position", "text") VALUES (?, ?, ?, ?)`,
        args: [
          `segment-${segmentIndex}`,
          `lesson-${lessonIndex}`,
          segmentIndex,
          "fixture segment",
        ],
      });
    }

    for (let exerciseIndex = 1; exerciseIndex <= 54; exerciseIndex += 1) {
      const lessonIndex = ((exerciseIndex - 1) % 5) + 1;
      statements.push({
        sql: `INSERT INTO "Exercise" ("id", "lessonId", "type", "prompt", "correctAnswer", "position") VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          `exercise-${exerciseIndex}`,
          `lesson-${lessonIndex}`,
          "VOCABULARY",
          "fixture prompt",
          "fixture answer",
          exerciseIndex,
        ],
      });
    }

    for (
      let vocabularyIndex = 1;
      vocabularyIndex <= 116;
      vocabularyIndex += 1
    ) {
      const vocabularyId = `vocabulary-${vocabularyIndex}`;
      const lessonIndex = ((vocabularyIndex - 1) % 5) + 1;
      statements.push({
        sql: `INSERT INTO "VocabularyItem" ("id", "lemma", "displayText", "meaningVi") VALUES (?, ?, ?, ?)`,
        args: [
          vocabularyId,
          `lemma-${vocabularyIndex}`,
          `Word ${vocabularyIndex}`,
          "fixture meaning",
        ],
      });
      statements.push({
        sql: `INSERT INTO "LessonVocabulary" ("lessonId", "vocabularyItemId") VALUES (?, ?)`,
        args: [`lesson-${lessonIndex}`, vocabularyId],
      });
    }

    await client.batch(statements, "write");
  } finally {
    client.close();
  }
  return url;
}

async function targetClient() {
  return createClient({ url: targetUrl });
}

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(
    path.join(os.tmpdir(), "listenai-migration-verifier-"),
  );
  sourceUrl = await createFixture("source.db");
  targetUrl = await createFixture("target.db");
});

afterAll(async () => {
  if (fixtureDirectory) {
    await rm(fixtureDirectory, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  }
});

describe("Plan 07 offline migration verifier", () => {
  it("accepts only explicit migration-scoped environment URLs", () => {
    const parsed = parseMigrationVerifierCli([], {
      MIGRATION_SOURCE_DATABASE_URL: "file:./source.db",
      MIGRATION_TARGET_DATABASE_URL: "file:./target.db",
    });

    expect(parsed).toMatchObject({
      source: { url: "file:./source.db" },
      target: { url: "file:./target.db" },
    });
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

  it("compares the complete D1 schema fixture without writing by default", async () => {
    const report = await verifyMigration({
      source: { url: sourceUrl },
      target: { url: targetUrl },
    });

    expect(report.status).toBe("passed");
    expect(report.comparison).toEqual({ passed: true, mismatches: [] });
    expect(report.source.applicationTables).toMatchObject({
      expectedCount: 27,
      matchesExpected: true,
    });
    expect(report.source.namedIndexes).toMatchObject({
      expectedCount: 48,
      matchesExpected: true,
    });
    expect(report.source.schema.foreignKeys).toHaveLength(45);
    expect(report.source.curriculum).toMatchObject({
      valid: true,
      lessonsInCoreCourse: "5",
      globalVocabularyItemRows: "116",
      lessonVocabularyJoinsInCoreCourse: "116",
      distinctVocabularyInCoreCourse: "116",
      segmentsInCoreCourse: "20",
      exercisesInCoreCourse: "54",
    });
    expect(report.stagingTimestampProbe).toMatchObject({
      status: "not-run",
    });

    const client = await targetClient();
    try {
      const probeRows = await client.execute(
        `SELECT COUNT(*) AS count FROM "AIInteraction" WHERE "purpose" = 'migration_timestamp_probe'`,
      );
      expect(probeRows.rows[0].count).toBe(0);
    } finally {
      client.close();
    }
  });

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

  it("blocks an index or redacted primary-key/count mismatch", async () => {
    const client = await targetClient();
    try {
      await client.execute(`DROP INDEX "AIInteraction_traceId_idx"`);
      await client.execute({
        sql: `INSERT INTO "VocabularyItem" ("id", "lemma", "displayText", "meaningVi") VALUES (?, ?, ?, ?)`,
        args: [
          "unexpected-vocabulary",
          "unexpected-lemma",
          "Unexpected",
          "fixture meaning",
        ],
      });
    } finally {
      client.close();
    }

    const report = await verifyMigration({
      source: { url: sourceUrl },
      target: { url: targetUrl },
    });

    expect(report.status).toBe("failed");
    expect(report.comparison.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "NAMED_INDEX_SET", subject: "target" }),
        expect.objectContaining({
          code: "TABLE_COUNT",
          subject: "VocabularyItem",
        }),
        expect.objectContaining({
          code: "PRIMARY_KEY_FINGERPRINT",
          subject: "VocabularyItem",
        }),
      ]),
    );
  });
});
