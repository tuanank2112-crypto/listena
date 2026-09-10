/**
 * Read-only verifier for the Plan 07 D1-to-Turso migration rehearsal.
 *
 * This tool deliberately does not export, import, seed, migrate, reset, or
 * mutate either database. Reports contain schema metadata, counts, and
 * cryptographic fingerprints only; they never print URLs, tokens, keys, or
 * application-row values. A staging-only write/read/delete probe belongs to
 * a separately approved operator procedure because a generic URL cannot
 * safely prove that a remote target is not production.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  type Client,
  type Row,
  type Value,
} from "@libsql/client";

const APPLICATION_TABLES = [
  "User",
  "LearnerMemory",
  "LearnerProfile",
  "Course",
  "Lesson",
  "LessonSegment",
  "VocabularyItem",
  "LessonVocabulary",
  "Exercise",
  "Attempt",
  "AttemptError",
  "VocabularyMastery",
  "SkillMastery",
  "Flashcard",
  "ReviewLog",
  "Recommendation",
  "AIInteraction",
  "LearningSession",
  "LearningTurn",
  "LearningEvidence",
  "Intervention",
  "PersonalizedLesson",
  "PersonalizedLessonVocabulary",
  "PersonalizedLessonAttempt",
  "AdaptiveGameRun",
  "AdaptiveGameRound",
  "AdaptiveEvidence",
] as const;

const EXPECTED_NAMED_INDEXES = [
  "User_email_key",
  "LearnerMemory_userId_key",
  "LearnerProfile_userId_key",
  "Lesson_courseId_idx",
  "Lesson_status_idx",
  "LessonSegment_lessonId_idx",
  "VocabularyItem_lemma_key",
  "Exercise_lessonId_idx",
  "Attempt_userId_lessonId_idx",
  "Attempt_userId_createdAt_idx",
  "AttemptError_attemptId_idx",
  "VocabularyMastery_userId_nextReviewAt_idx",
  "VocabularyMastery_userId_vocabularyItemId_key",
  "SkillMastery_userId_skillKey_idx",
  "SkillMastery_userId_skillKey_key",
  "Flashcard_userId_active_idx",
  "Flashcard_userId_vocabularyItemId_idx",
  "ReviewLog_flashcardId_idx",
  "ReviewLog_userId_reviewedAt_idx",
  "Recommendation_userId_status_idx",
  "Recommendation_userId_generatedAt_idx",
  "Recommendation_userId_lessonId_key",
  "AIInteraction_createdAt_idx",
  "AIInteraction_purpose_success_idx",
  "AIInteraction_sessionId_createdAt_idx",
  "AIInteraction_traceId_idx",
  "LearningSession_userId_status_updatedAt_idx",
  "LearningSession_lessonId_status_idx",
  "LearningTurn_sessionId_createdAt_idx",
  "LearningTurn_sessionId_sequence_key",
  "LearningTurn_sessionId_clientTurnId_key",
  "LearningEvidence_sessionId_createdAt_idx",
  "LearningEvidence_skillKey_createdAt_idx",
  "Intervention_sessionId_status_idx",
  "PersonalizedLesson_userId_status_createdAt_idx",
  "PersonalizedLesson_userId_targetSkill_sourceSnapshotHash_key",
  "PersonalizedLesson_userId_generationKey_key",
  "PersonalizedLessonVocabulary_vocabularyItemId_idx",
  "PersonalizedLessonAttempt_lessonId_clientAttemptId_key",
  "PersonalizedLessonAttempt_userId_lessonId_createdAt_idx",
  "AdaptiveGameRun_userId_status_startedAt_idx",
  "AdaptiveGameRound_runId_position_key",
  "AdaptiveGameRound_runId_clientAnswerId_key",
  "AdaptiveGameRound_vocabularyItemId_idx",
  "AdaptiveEvidence_sourceKind_sourceId_skillKey_key",
  "AdaptiveEvidence_userId_skillKey_createdAt_idx",
  "AdaptiveEvidence_userId_vocabularyItemId_createdAt_idx",
  "AIInteraction_userId_purpose_createdAt_idx",
] as const;

const EXPECTED_FOREIGN_KEY_COUNT = 45;
const CORE_COURSE_ID = "464c2a28-e631-4c2e-80b4-a6e5f5cefcbf";
const SYSTEM_CURRICULUM_USER_ID = "aed67c1c-b8e4-4ffc-806e-25c65d860c09";
const SYSTEM_CURRICULUM_EMAIL = "system-curriculum@listena.invalid";
const PRIMARY_KEY_PAGE_SIZE = 500;

export type MigrationDatabaseConnection = {
  url: string;
  authToken?: string;
};

export type MigrationVerifierOptions = {
  source: MigrationDatabaseConnection;
  target: MigrationDatabaseConnection;
};

export type ColumnDescriptor = {
  name: string;
  declaredType: string;
  nullable: boolean;
  primaryKeyPosition: number;
  /** Hash of the normalized SQL default; raw values are never reported. */
  defaultSignature: string | null;
};

export type TableDescriptor = {
  name: string;
  columns: ColumnDescriptor[];
};

export type ForeignKeyDescriptor = {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  onDelete: string;
  onUpdate: string;
};

export type IndexDescriptor = {
  table: string;
  name: string;
  unique: boolean;
  keys: Array<{
    position: number;
    column: string | null;
    descending: boolean;
    collation: string | null;
  }>;
  /** Hash of an expression-index definition, if the index has one. */
  expressionSignature: string | null;
  /** Hash of a partial-index predicate, if the index has one. */
  predicateSignature: string | null;
};

export type PrimaryKeyFingerprint =
  | {
      supported: true;
      columns: string[];
      count: string;
      sha256: string;
    }
  | {
      supported: false;
      reason: "NO_PRIMARY_KEY";
    };

export type TimestampSummary = {
  nullCount: string;
  storageClasses: Array<{ storageClass: string; count: string }>;
  unparseableNonNullCount: string;
  minUtc: string | null;
  maxUtc: string | null;
  /** UTC day buckets, never timestamp source values. */
  utcDayBuckets: Array<{ day: string; count: string }>;
};

export type CurriculumSummary = {
  available: boolean;
  valid: boolean;
  systemOwnerCount: string | null;
  courseOwnedBySystemCount: string | null;
  lessonsInCoreCourse: string | null;
  segmentsInCoreCourse: string | null;
  exercisesInCoreCourse: string | null;
  /** Global count is comparison evidence only, not a fixed curriculum target. */
  globalVocabularyItemRows: string | null;
  lessonVocabularyJoinsInCoreCourse: string | null;
  distinctVocabularyInCoreCourse: string | null;
};

export type DatabaseFingerprint = {
  applicationTables: {
    expectedCount: number;
    actual: string[];
    missingExpected: string[];
    unexpected: string[];
    matchesExpected: boolean;
  };
  schema: {
    tables: TableDescriptor[];
    foreignKeys: ForeignKeyDescriptor[];
    semanticSignature: string;
  };
  namedIndexes: {
    expectedCount: number;
    actual: IndexDescriptor[];
    missingExpected: string[];
    unexpected: string[];
    matchesExpected: boolean;
    semanticSignature: string;
  };
  integrity: {
    foreignKeyViolationCount: string;
    integrityCheckOk: boolean;
    quickCheckOk: boolean;
  };
  tableCounts: Record<string, string>;
  primaryKeys: Record<string, PrimaryKeyFingerprint>;
  timestamps: Record<string, TimestampSummary>;
  curriculum: CurriculumSummary;
};

export type VerificationMismatch = {
  code:
    | "APPLICATION_TABLE_SET"
    | "NAMED_INDEX_SET"
    | "FOREIGN_KEY_COUNT"
    | "SEMANTIC_SCHEMA"
    | "SEMANTIC_INDEX"
    | "FOREIGN_KEY_CHECK"
    | "INTEGRITY_CHECK"
    | "QUICK_CHECK"
    | "TABLE_COUNT"
    | "PRIMARY_KEY_FINGERPRINT"
    | "TIMESTAMP_FINGERPRINT"
    | "CORE_CURRICULUM";
  subject: string;
  source?: string;
  target?: string;
};

export type StagingProbeResult = {
  status: "not-run";
  reason?: string;
};

export type MigrationVerificationReport = {
  status: "passed" | "failed";
  source: DatabaseFingerprint;
  target: DatabaseFingerprint;
  comparison: {
    passed: boolean;
    mismatches: VerificationMismatch[];
  };
  stagingTimestampProbe: StagingProbeResult;
  coverage: {
    performed: string[];
    gaps: string[];
  };
};

class MigrationVerifierError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "DATABASE_READ_FAILED",
    message: string,
  ) {
    super(message);
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeSqlFragment(value: string) {
  let output = "";
  let quote: "'" | '"' | "`" | null = null;
  let whitespacePending = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      output += character;
      if (character === quote) {
        if (value[index + 1] === quote) {
          output += value[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      if (whitespacePending && output) output += " ";
      whitespacePending = false;
      quote = character;
      output += character;
      continue;
    }

    if (/\s/.test(character)) {
      whitespacePending = true;
      continue;
    }

    if (whitespacePending && output) output += " ";
    whitespacePending = false;
    output += character.toUpperCase();
  }

  return output.trim();
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function sortByJson<T>(items: T[]) {
  return [...items].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function rowValue(row: Row, name: string): Value | undefined {
  return row[name];
}

function stringValue(row: Row, name: string): string | null {
  const value = rowValue(row, name);
  if (value === null || value === undefined) return null;
  if (value instanceof ArrayBuffer) return null;
  return String(value);
}

function integerValue(row: Row, name: string): number {
  const value = stringValue(row, name);
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function countValue(row: Row, name: string): string {
  const value = stringValue(row, name);
  return value ?? "0";
}

function equalCount(left: string | null, right: string | null) {
  return left !== null && right !== null && left === right;
}

function expectedTableSet() {
  return new Set<string>(APPLICATION_TABLES);
}

function expectedIndexSet() {
  return new Set<string>(EXPECTED_NAMED_INDEXES);
}

function hashDescriptor(value: unknown) {
  return sha256(JSON.stringify(value));
}

function extractWhereClause(sql: string | null) {
  if (!sql) return null;
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index <= sql.length - 5; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }

    const candidate = sql.slice(index, index + 5);
    const before = sql[index - 1] ?? " ";
    const after = sql[index + 5] ?? " ";
    if (
      candidate.toUpperCase() === "WHERE" &&
      !/[A-Z0-9_]/i.test(before) &&
      !/[A-Z0-9_]/i.test(after)
    ) {
      return normalizeSqlFragment(sql.slice(index + 5));
    }
  }

  return null;
}

function timestampExpression(column: string) {
  const numericSeconds = `CASE WHEN ABS(CAST(${column} AS REAL)) >= 100000000000 THEN CAST(${column} AS REAL) / 1000.0 ELSE CAST(${column} AS REAL) END`;
  return `CASE
    WHEN typeof(${column}) IN ('integer', 'real') THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${numericSeconds}, 'unixepoch')
    WHEN typeof(${column}) = 'text' THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${column})
    ELSE NULL
  END`;
}

function timestampBucketExpression(column: string) {
  const numericSeconds = `CASE WHEN ABS(CAST(${column} AS REAL)) >= 100000000000 THEN CAST(${column} AS REAL) / 1000.0 ELSE CAST(${column} AS REAL) END`;
  return `CASE
    WHEN typeof(${column}) IN ('integer', 'real') THEN strftime('%Y-%m-%d', ${numericSeconds}, 'unixepoch')
    WHEN typeof(${column}) = 'text' THEN strftime('%Y-%m-%d', ${column})
    ELSE NULL
  END`;
}

function isTimestampColumn(column: ColumnDescriptor) {
  return (
    /DATE|TIME/i.test(column.declaredType) || /(?:AT|ATMS)$/i.test(column.name)
  );
}

function createReadClient(connection: MigrationDatabaseConnection): Client {
  try {
    return createClient({
      url: connection.url,
      ...(connection.authToken ? { authToken: connection.authToken } : {}),
      intMode: "string",
    });
  } catch {
    throw new MigrationVerifierError(
      "DATABASE_READ_FAILED",
      "Unable to open a database connection without disclosing connection details.",
    );
  }
}

async function readApplicationTableNames(client: Client) {
  const result = await client.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  return result.rows
    .map((row) => stringValue(row, "name"))
    .filter((name): name is string => name !== null);
}

async function readSchema(client: Client, tables: string[]) {
  const tableDescriptors: TableDescriptor[] = [];
  const foreignKeys: ForeignKeyDescriptor[] = [];

  for (const table of tables) {
    const tableInfo = await client.execute(
      `PRAGMA table_info(${quoteIdentifier(table)})`,
    );
    const columns = tableInfo.rows
      .map((row): ColumnDescriptor => {
        const rawDefault = stringValue(row, "dflt_value");
        return {
          name: stringValue(row, "name") ?? "",
          declaredType: normalizeSqlFragment(stringValue(row, "type") ?? ""),
          nullable: integerValue(row, "notnull") === 0,
          primaryKeyPosition: integerValue(row, "pk"),
          defaultSignature:
            rawDefault === null
              ? null
              : sha256(normalizeSqlFragment(rawDefault)),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    tableDescriptors.push({ name: table, columns });

    const foreignKeyRows = await client.execute(
      `PRAGMA foreign_key_list(${quoteIdentifier(table)})`,
    );
    for (const row of foreignKeyRows.rows) {
      foreignKeys.push({
        childTable: table,
        childColumn: stringValue(row, "from") ?? "",
        parentTable: stringValue(row, "table") ?? "",
        parentColumn: stringValue(row, "to") ?? "",
        onDelete: normalizeSqlFragment(
          stringValue(row, "on_delete") ?? "NO ACTION",
        ),
        onUpdate: normalizeSqlFragment(
          stringValue(row, "on_update") ?? "NO ACTION",
        ),
      });
    }
  }

  const normalizedTables = tableDescriptors.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const normalizedForeignKeys = sortByJson(foreignKeys);
  return {
    tables: normalizedTables,
    foreignKeys: normalizedForeignKeys,
    semanticSignature: hashDescriptor({
      tables: normalizedTables,
      foreignKeys: normalizedForeignKeys,
    }),
  };
}

async function readNamedIndexes(client: Client, tables: string[]) {
  const indexRows = await client.execute(`
    SELECT name, tbl_name, sql
    FROM sqlite_master
    WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'
    ORDER BY tbl_name, name
  `);
  const indexes: IndexDescriptor[] = [];

  for (const row of indexRows.rows) {
    const name = stringValue(row, "name");
    const table = stringValue(row, "tbl_name");
    if (!name || !table || !tables.includes(table)) continue;

    const sql = stringValue(row, "sql");
    const indexList = await client.execute(
      `PRAGMA index_list(${quoteIdentifier(table)})`,
    );
    const indexMetadata = indexList.rows.find(
      (index) => stringValue(index, "name") === name,
    );
    const indexInfo = await client.execute(
      `PRAGMA index_xinfo(${quoteIdentifier(name)})`,
    );
    const keys = indexInfo.rows
      .filter((index) => integerValue(index, "key") === 1)
      .map((index) => ({
        position: integerValue(index, "seqno"),
        column: stringValue(index, "name"),
        descending: integerValue(index, "desc") === 1,
        collation: stringValue(index, "coll"),
      }))
      .sort((left, right) => left.position - right.position);
    const hasExpression = keys.some((key) => key.column === null);
    const predicate = extractWhereClause(sql);

    indexes.push({
      table,
      name,
      unique: indexMetadata
        ? integerValue(indexMetadata, "unique") === 1
        : false,
      keys,
      expressionSignature: hasExpression
        ? sha256(normalizeSqlFragment(sql ?? ""))
        : null,
      predicateSignature: predicate ? sha256(predicate) : null,
    });
  }

  const normalizedIndexes = indexes.sort((left, right) => {
    const tableOrder = left.table.localeCompare(right.table);
    return tableOrder || left.name.localeCompare(right.name);
  });
  const actualNames = normalizedIndexes.map((index) => index.name).sort();
  const expected = expectedIndexSet();
  const actual = new Set(actualNames);
  const missingExpected = EXPECTED_NAMED_INDEXES.filter(
    (name) => !actual.has(name),
  );
  const unexpected = actualNames.filter((name) => !expected.has(name));

  return {
    expectedCount: EXPECTED_NAMED_INDEXES.length,
    actual: normalizedIndexes,
    missingExpected,
    unexpected,
    matchesExpected:
      missingExpected.length === 0 &&
      unexpected.length === 0 &&
      actualNames.length === EXPECTED_NAMED_INDEXES.length,
    semanticSignature: hashDescriptor(normalizedIndexes),
  };
}

async function readIntegrity(client: Client) {
  const [foreignKeyCheck, integrityCheck, quickCheck] = await Promise.all([
    client.execute("PRAGMA foreign_key_check"),
    client.execute("PRAGMA integrity_check"),
    client.execute("PRAGMA quick_check"),
  ]);
  // libSQL Row supports both positional and named access. The first-column
  // access is intentionally not surfaced in the report, because an error row
  // could contain arbitrary database text.
  const resultIsOk = (rows: Row[]) =>
    rows.length === 1 && String(rows[0][0]).toLowerCase() === "ok";

  return {
    foreignKeyViolationCount: String(foreignKeyCheck.rows.length),
    integrityCheckOk: resultIsOk(integrityCheck.rows),
    quickCheckOk: resultIsOk(quickCheck.rows),
  };
}

async function countRows(client: Client, table: string) {
  const result = await client.execute(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`,
  );
  return countValue(result.rows[0], "count");
}

function hashPrimaryKeyValue(
  hash: ReturnType<typeof createHash>,
  storageClass: string,
  value: Value | undefined,
) {
  hash.update(storageClass);
  hash.update(":");

  if (value === null || value === undefined) {
    hash.update("NULL;\n");
    return;
  }

  let bytes: Uint8Array;
  if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else bytes = Buffer.from(String(value), "utf8");
  hash.update(String(bytes.byteLength));
  hash.update(":");
  hash.update(bytes);
  hash.update(";\n");
}

async function fingerprintPrimaryKeys(
  client: Client,
  table: string,
  columns: string[],
): Promise<PrimaryKeyFingerprint> {
  if (columns.length === 0)
    return { supported: false, reason: "NO_PRIMARY_KEY" };

  const hash = createHash("sha256");
  hash.update(`table:${table}\n`);
  hash.update(`columns:${columns.join(",")}\n`);
  const selectColumns = columns
    .flatMap((column, index) => [
      `${quoteIdentifier(column)} AS ${quoteIdentifier(`value_${index}`)}`,
      `typeof(${quoteIdentifier(column)}) AS ${quoteIdentifier(`type_${index}`)}`,
    ])
    .join(", ");
  const orderColumns = columns
    .map((column) => `${quoteIdentifier(column)} COLLATE BINARY`)
    .join(", ");
  let offset = 0;
  let rowCount = 0;

  while (true) {
    const result = await client.execute({
      sql: `SELECT ${selectColumns} FROM ${quoteIdentifier(table)} ORDER BY ${orderColumns} LIMIT ? OFFSET ?`,
      args: [PRIMARY_KEY_PAGE_SIZE, offset],
    });

    for (const row of result.rows) {
      for (let index = 0; index < columns.length; index += 1) {
        hashPrimaryKeyValue(
          hash,
          stringValue(row, `type_${index}`) ?? "null",
          rowValue(row, `value_${index}`),
        );
      }
      hash.update("row-end\n");
      rowCount += 1;
    }

    if (result.rows.length < PRIMARY_KEY_PAGE_SIZE) break;
    offset += result.rows.length;
  }

  return {
    supported: true,
    columns,
    count: String(rowCount),
    sha256: hash.digest("hex"),
  };
}

async function readTimestamps(
  client: Client,
  schema: { tables: TableDescriptor[] },
) {
  const timestamps: Record<string, TimestampSummary> = {};

  for (const table of schema.tables) {
    for (const column of table.columns.filter(isTimestampColumn)) {
      const tableName = quoteIdentifier(table.name);
      const columnName = quoteIdentifier(column.name);
      const utc = timestampExpression(columnName);
      const bucket = timestampBucketExpression(columnName);
      const [storageRows, summaryRows, bucketRows] = await Promise.all([
        client.execute(`
          SELECT typeof(${columnName}) AS storageClass, COUNT(*) AS count
          FROM ${tableName}
          GROUP BY typeof(${columnName})
          ORDER BY storageClass
        `),
        client.execute(`
          SELECT
            SUM(CASE WHEN ${columnName} IS NULL THEN 1 ELSE 0 END) AS nullCount,
            SUM(CASE WHEN ${columnName} IS NOT NULL AND (${utc}) IS NULL THEN 1 ELSE 0 END) AS unparseableNonNullCount,
            MIN(${utc}) AS minUtc,
            MAX(${utc}) AS maxUtc
          FROM ${tableName}
        `),
        client.execute(`
          SELECT ${bucket} AS bucket, COUNT(*) AS count
          FROM ${tableName}
          WHERE ${columnName} IS NOT NULL
          GROUP BY bucket
          ORDER BY bucket
        `),
      ]);

      const summary = summaryRows.rows[0];
      timestamps[`${table.name}.${column.name}`] = {
        nullCount: countValue(summary, "nullCount"),
        storageClasses: storageRows.rows.map((row) => ({
          storageClass: stringValue(row, "storageClass") ?? "null",
          count: countValue(row, "count"),
        })),
        unparseableNonNullCount: countValue(summary, "unparseableNonNullCount"),
        minUtc: stringValue(summary, "minUtc"),
        maxUtc: stringValue(summary, "maxUtc"),
        utcDayBuckets: bucketRows.rows
          .filter((row) => stringValue(row, "bucket") !== null)
          .map((row) => ({
            day: stringValue(row, "bucket") ?? "",
            count: countValue(row, "count"),
          })),
      };
    }
  }

  return timestamps;
}

async function scalarCount(
  client: Client,
  sql: string,
  args: Array<string | number> = [],
) {
  const result = await client.execute({ sql, args });
  return countValue(result.rows[0], "count");
}

async function readCurriculum(
  client: Client,
  actualTables: string[],
): Promise<CurriculumSummary> {
  const required = [
    "User",
    "Course",
    "Lesson",
    "LessonSegment",
    "Exercise",
    "VocabularyItem",
    "LessonVocabulary",
  ];
  if (required.some((table) => !actualTables.includes(table))) {
    return {
      available: false,
      valid: false,
      systemOwnerCount: null,
      courseOwnedBySystemCount: null,
      lessonsInCoreCourse: null,
      segmentsInCoreCourse: null,
      exercisesInCoreCourse: null,
      globalVocabularyItemRows: null,
      lessonVocabularyJoinsInCoreCourse: null,
      distinctVocabularyInCoreCourse: null,
    };
  }

  const [
    systemOwnerCount,
    courseOwnedBySystemCount,
    lessonsInCoreCourse,
    segmentsInCoreCourse,
    exercisesInCoreCourse,
    globalVocabularyItemRows,
    lessonVocabularyJoinsInCoreCourse,
    distinctVocabularyInCoreCourse,
  ] = await Promise.all([
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "User" WHERE "id" = ? AND "email" = ? AND "role" = 'ADMIN'`,
      [SYSTEM_CURRICULUM_USER_ID, SYSTEM_CURRICULUM_EMAIL],
    ),
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "Course" WHERE "id" = ? AND "createdById" = ?`,
      [CORE_COURSE_ID, SYSTEM_CURRICULUM_USER_ID],
    ),
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "Lesson" WHERE "courseId" = ?`,
      [CORE_COURSE_ID],
    ),
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "LessonSegment" AS segment INNER JOIN "Lesson" AS lesson ON lesson."id" = segment."lessonId" WHERE lesson."courseId" = ?`,
      [CORE_COURSE_ID],
    ),
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "Exercise" AS exercise INNER JOIN "Lesson" AS lesson ON lesson."id" = exercise."lessonId" WHERE lesson."courseId" = ?`,
      [CORE_COURSE_ID],
    ),
    scalarCount(client, `SELECT COUNT(*) AS count FROM "VocabularyItem"`),
    scalarCount(
      client,
      `SELECT COUNT(*) AS count FROM "LessonVocabulary" AS lessonVocabulary INNER JOIN "Lesson" AS lesson ON lesson."id" = lessonVocabulary."lessonId" WHERE lesson."courseId" = ?`,
      [CORE_COURSE_ID],
    ),
    scalarCount(
      client,
      `SELECT COUNT(DISTINCT lessonVocabulary."vocabularyItemId") AS count FROM "LessonVocabulary" AS lessonVocabulary INNER JOIN "Lesson" AS lesson ON lesson."id" = lessonVocabulary."lessonId" WHERE lesson."courseId" = ?`,
      [CORE_COURSE_ID],
    ),
  ]);

  const valid = [
    [systemOwnerCount, "1"],
    [courseOwnedBySystemCount, "1"],
    [lessonsInCoreCourse, "5"],
    [segmentsInCoreCourse, "20"],
    [exercisesInCoreCourse, "54"],
    [lessonVocabularyJoinsInCoreCourse, "116"],
    [distinctVocabularyInCoreCourse, "116"],
  ].every(([actual, expected]) => actual === expected);

  return {
    available: true,
    valid,
    systemOwnerCount,
    courseOwnedBySystemCount,
    lessonsInCoreCourse,
    segmentsInCoreCourse,
    exercisesInCoreCourse,
    globalVocabularyItemRows,
    lessonVocabularyJoinsInCoreCourse,
    distinctVocabularyInCoreCourse,
  };
}

export async function fingerprintMigrationDatabase(
  connection: MigrationDatabaseConnection,
): Promise<DatabaseFingerprint> {
  const client = createReadClient(connection);
  try {
    const actualTableNames = await readApplicationTableNames(client);
    const expectedTables = expectedTableSet();
    const actualTableSet = new Set(actualTableNames);
    const missingExpected = APPLICATION_TABLES.filter(
      (table) => !actualTableSet.has(table),
    );
    const unexpected = actualTableNames.filter(
      (table) => !expectedTables.has(table),
    );
    // A surprise table is itself a blocking mismatch. Do not recursively scan
    // unknown application data: the verifier's bounded evidence surface is the
    // 27-table Plan 07 contract only.
    const verifiedTables = APPLICATION_TABLES.filter((table) =>
      actualTableSet.has(table),
    );
    const schema = await readSchema(client, verifiedTables);
    const namedIndexes = await readNamedIndexes(client, verifiedTables);
    const [integrity, timestamps, curriculum] = await Promise.all([
      readIntegrity(client),
      readTimestamps(client, schema),
      readCurriculum(client, actualTableNames),
    ]);
    const tableCounts: Record<string, string> = {};
    const primaryKeys: Record<string, PrimaryKeyFingerprint> = {};

    for (const table of schema.tables) {
      tableCounts[table.name] = await countRows(client, table.name);
      const primaryKeyColumns = table.columns
        .filter((column) => column.primaryKeyPosition > 0)
        .sort(
          (left, right) => left.primaryKeyPosition - right.primaryKeyPosition,
        )
        .map((column) => column.name);
      primaryKeys[table.name] = await fingerprintPrimaryKeys(
        client,
        table.name,
        primaryKeyColumns,
      );
    }

    return {
      applicationTables: {
        expectedCount: APPLICATION_TABLES.length,
        actual: actualTableNames,
        missingExpected,
        unexpected,
        matchesExpected:
          missingExpected.length === 0 &&
          unexpected.length === 0 &&
          actualTableNames.length === APPLICATION_TABLES.length,
      },
      schema,
      namedIndexes,
      integrity,
      tableCounts,
      primaryKeys,
      timestamps,
      curriculum,
    };
  } catch (error) {
    if (error instanceof MigrationVerifierError) throw error;
    throw new MigrationVerifierError(
      "DATABASE_READ_FAILED",
      "Unable to complete a read-only database fingerprint without disclosing connection details.",
    );
  } finally {
    client.close();
  }
}

function compareFingerprints(
  source: DatabaseFingerprint,
  target: DatabaseFingerprint,
) {
  const mismatches: VerificationMismatch[] = [];
  const add = (mismatch: VerificationMismatch) => mismatches.push(mismatch);

  for (const [label, fingerprint] of [
    ["source", source],
    ["target", target],
  ] as const) {
    if (!fingerprint.applicationTables.matchesExpected) {
      add({ code: "APPLICATION_TABLE_SET", subject: label });
    }
    if (!fingerprint.namedIndexes.matchesExpected) {
      add({ code: "NAMED_INDEX_SET", subject: label });
    }
    if (fingerprint.schema.foreignKeys.length !== EXPECTED_FOREIGN_KEY_COUNT) {
      add({
        code: "FOREIGN_KEY_COUNT",
        subject: label,
        source: String(fingerprint.schema.foreignKeys.length),
        target: String(EXPECTED_FOREIGN_KEY_COUNT),
      });
    }
    if (fingerprint.integrity.foreignKeyViolationCount !== "0") {
      add({
        code: "FOREIGN_KEY_CHECK",
        subject: label,
        source: fingerprint.integrity.foreignKeyViolationCount,
      });
    }
    if (!fingerprint.integrity.integrityCheckOk)
      add({ code: "INTEGRITY_CHECK", subject: label });
    if (!fingerprint.integrity.quickCheckOk)
      add({ code: "QUICK_CHECK", subject: label });
    if (!fingerprint.curriculum.valid)
      add({ code: "CORE_CURRICULUM", subject: label });
  }

  if (source.schema.semanticSignature !== target.schema.semanticSignature) {
    add({ code: "SEMANTIC_SCHEMA", subject: "source-target" });
  }
  if (
    source.namedIndexes.semanticSignature !==
    target.namedIndexes.semanticSignature
  ) {
    add({ code: "SEMANTIC_INDEX", subject: "source-target" });
  }

  const allTables = [
    ...new Set([
      ...Object.keys(source.tableCounts),
      ...Object.keys(target.tableCounts),
    ]),
  ].sort();
  for (const table of allTables) {
    if (
      !equalCount(
        source.tableCounts[table] ?? null,
        target.tableCounts[table] ?? null,
      )
    ) {
      add({
        code: "TABLE_COUNT",
        subject: table,
        source: source.tableCounts[table],
        target: target.tableCounts[table],
      });
    }

    const sourceKey = source.primaryKeys[table];
    const targetKey = target.primaryKeys[table];
    if (JSON.stringify(sourceKey) !== JSON.stringify(targetKey)) {
      add({ code: "PRIMARY_KEY_FINGERPRINT", subject: table });
    }
  }

  const timestampKeys = [
    ...new Set([
      ...Object.keys(source.timestamps),
      ...Object.keys(target.timestamps),
    ]),
  ].sort();
  for (const key of timestampKeys) {
    if (
      JSON.stringify(source.timestamps[key]) !==
      JSON.stringify(target.timestamps[key])
    ) {
      add({ code: "TIMESTAMP_FINGERPRINT", subject: key });
    }
  }

  return { passed: mismatches.length === 0, mismatches };
}

function validateConnection(
  connection: MigrationDatabaseConnection,
  role: "source" | "target",
) {
  if (!connection.url.trim()) {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      `A ${role} database URL is required.`,
    );
  }
  if (connection.url.startsWith("file:")) {
    if (connection.authToken) {
      throw new MigrationVerifierError(
        "INVALID_INPUT",
        `${role} SQLite connections must not include an auth token.`,
      );
    }
    if (connection.url === "file::memory:") {
      throw new MigrationVerifierError(
        "INVALID_INPUT",
        "In-memory SQLite URLs cannot provide an import-verification artifact.",
      );
    }
    return;
  }

  try {
    if (/%(?![0-9a-f]{2})/i.test(connection.url)) {
      throw new Error("invalid endpoint");
    }
    const parsed = new URL(connection.url);
    if (
      (parsed.protocol !== "libsql:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "" && parsed.pathname !== "/")
    ) {
      throw new Error("invalid endpoint");
    }
  } catch {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      `${role} must be a file:, libsql:, or https: database URL without embedded credentials.`,
    );
  }
}

function endpointIdentity(url: string) {
  if (url.startsWith("file:")) {
    try {
      if (url.startsWith("file://"))
        return `file:${path.normalize(fileURLToPath(url)).toLowerCase()}`;
    } catch {
      // The client will emit the safe generic connection error below if a
      // syntactically valid-looking local URL cannot be opened.
    }
    return `file:${path.resolve(process.cwd(), url.slice("file:".length)).toLowerCase()}`;
  }

  const parsed = new URL(url);
  // `libsql://database.turso.io` and `https://database.turso.io` are two
  // transports for the same Turso endpoint. Protocol must not let a
  // source/target self-comparison pass as a migration proof.
  return `remote:${parsed.hostname.toLowerCase()}:${parsed.port || "443"}`;
}

function validateOptions(options: MigrationVerifierOptions) {
  validateConnection(options.source, "source");
  validateConnection(options.target, "target");
  if (
    endpointIdentity(options.source.url) ===
    endpointIdentity(options.target.url)
  ) {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      "Source and target must be distinct database endpoints before verification.",
    );
  }
}

export async function verifyMigration(
  options: MigrationVerifierOptions,
): Promise<MigrationVerificationReport> {
  validateOptions(options);
  const [source, target] = await Promise.all([
    fingerprintMigrationDatabase(options.source),
    fingerprintMigrationDatabase(options.target),
  ]);
  const comparison = compareFingerprints(source, target);
  const stagingTimestampProbe: StagingProbeResult = {
    status: "not-run",
    reason:
      "This verifier is intentionally read-only. Perform any staging-only Prisma/raw-libSQL write-read-delete proof through a separately approved operator procedure after the target identity is verified.",
  };

  const passed = comparison.passed;
  return {
    status: passed ? "passed" : "failed",
    source,
    target,
    comparison,
    stagingTimestampProbe,
    coverage: {
      performed: [
        "exact 27-table application inventory",
        "semantic columns, foreign keys, and 48 named indexes excluding sqlite_autoindex",
        "PRAGMA foreign_key_check, integrity_check, and quick_check",
        "per-table row counts and deterministic redacted primary-key SHA-256 fingerprints",
        "per-timestamp storage-class, UTC-day bucket, null, min/max, and parseability summaries",
        "system curriculum owner/course and 5 lessons / 116 core joins + distinct vocabulary / 20 segments / 54 exercises checks",
        "read-only per-timestamp storage-class and canonical UTC evidence",
      ],
      gaps: [
        "This verifier does not export or import D1 data, create Turso databases, deploy Vercel, change DNS, or establish the Cloudflare maintenance/export fence.",
        "This verifier never writes a timestamp probe. A staging-only Prisma/raw-libSQL write-read-delete proof requires separate, recorded operator approval after independently verifying the target database identity.",
        "It cannot prove a remote source remained immutable between independent read queries; run it inside the approved export fence and compare pre/post source reports.",
        "It fingerprints primary keys and reports counts, not non-key learner content or row-by-row non-key values. A reviewed conversion needs additional purpose-built aggregate checks.",
        "Expression-index and partial-index SQL are compared through normalized SHA-256 signatures; the current 48-index contract has no expression or partial index.",
      ],
    },
  };
}

type ParsedCli = MigrationVerifierOptions | { help: true };

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseFlagValues(args: string[]) {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h")
      return { values, help: true };

    const matched =
      /^(--(?:source-url|target-url|source-token|target-token))(?:=(.*))?$/.exec(
        argument,
      );
    if (!matched) {
      throw new MigrationVerifierError(
        "INVALID_INPUT",
        "An unsupported migration-verifier argument was supplied.",
      );
    }
    const [, flag, inlineValue] = matched;
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new MigrationVerifierError(
        "INVALID_INPUT",
        `A value is required for ${flag}.`,
      );
    }
    if (inlineValue === undefined) index += 1;
    values.set(flag, value);
  }

  return { values, help: false };
}

export function parseMigrationVerifierCli(
  args: string[] = process.argv.slice(2),
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ParsedCli {
  const parsed = parseFlagValues(args);
  if (parsed.help) return { help: true };

  const sourceUrl =
    parsed.values.get("--source-url") ??
    cleanEnv(env.MIGRATION_SOURCE_DATABASE_URL);
  const targetUrl =
    parsed.values.get("--target-url") ??
    cleanEnv(env.MIGRATION_TARGET_DATABASE_URL);
  const sourceToken =
    parsed.values.get("--source-token") ??
    cleanEnv(env.MIGRATION_SOURCE_AUTH_TOKEN);
  const targetToken =
    parsed.values.get("--target-token") ??
    cleanEnv(env.MIGRATION_TARGET_AUTH_TOKEN);
  if (!sourceUrl || !targetUrl) {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      "Explicit source and target URLs are required through arguments or MIGRATION_SOURCE_DATABASE_URL / MIGRATION_TARGET_DATABASE_URL.",
    );
  }
  return {
    source: {
      url: sourceUrl,
      ...(sourceToken ? { authToken: sourceToken } : {}),
    },
    target: {
      url: targetUrl,
      ...(targetToken ? { authToken: targetToken } : {}),
    },
  };
}

function usage() {
  return [
    "Usage: npm run migration:verify -- --source-url <file:|libsql:|https:> --target-url <file:|libsql:|https:>",
    "Prefer MIGRATION_SOURCE_DATABASE_URL, MIGRATION_TARGET_DATABASE_URL, and the matching *_AUTH_TOKEN environment variables so credentials do not enter shell history.",
    "The tool is intentionally read-only. A staging write/read/delete proof is a separate approved operator procedure after target identity verification.",
  ].join("\n");
}

async function main() {
  try {
    const options = parseMigrationVerifierCli();
    if ("help" in options) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const report = await verifyMigration(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safeError =
      error instanceof MigrationVerifierError
        ? { code: error.code, message: error.message }
        : {
            code: "DATABASE_READ_FAILED",
            message:
              "Migration verification failed without disclosing connection details.",
          };
    process.stderr.write(
      `${JSON.stringify({ status: "failed", error: safeError }, null, 2)}\n`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
