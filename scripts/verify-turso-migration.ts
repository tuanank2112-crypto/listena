/**
 * Read-only verifier for a ListenAI database against the Prisma migration
 * contract (Plan13 SPEC-P134 §1, finding D3).
 *
 * The expected contract is not hard-coded any more. It is derived at run time
 * by applying every `prisma/migrations/<dir>/migration.sql` (in directory
 * name order) to a throw-away SQLite file in the OS temp directory and
 * fingerprinting the result with exactly the same algorithm that is used for
 * the target database. Tables, columns, defaults, foreign keys, named indexes
 * (including partial/expression indexes, compared through normalized SQL
 * signatures) therefore always follow the checked-in migrations.
 *
 * Optionally a source database can be supplied; then row counts, redacted
 * primary-key fingerprints, timestamp summaries and the curriculum summary of
 * source and target are compared as migration-copy evidence.
 *
 * This tool never exports, imports, seeds, migrates, resets, or mutates the
 * source or target database. Reports contain schema metadata, counts, and
 * cryptographic fingerprints only; they never print URLs, tokens, keys, file
 * paths of the databases, or application-row values.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  type Client,
  type Row,
  type Value,
} from "@libsql/client";

/**
 * Engine-owned bookkeeping tables. `d1_migrations` is written by Cloudflare
 * D1 and `_prisma_migrations` by `prisma migrate`; a database created through
 * `turso db shell < migration.sql` has neither. They are not application data
 * and never take part in the contract. Every other non-`sqlite_%` table is
 * compared against the migration contract.
 */
const IGNORED_INFRASTRUCTURE_TABLES = new Set([
  "d1_migrations",
  "_prisma_migrations",
]);

const DEFAULT_MIGRATIONS_DIRECTORY = path.join("prisma", "migrations");
const MIGRATION_FILE_NAME = "migration.sql";
const CORE_COURSE_ID = "464c2a28-e631-4c2e-80b4-a6e5f5cefcbf";
const SYSTEM_CURRICULUM_USER_ID = "aed67c1c-b8e4-4ffc-806e-25c65d860c09";
const SYSTEM_CURRICULUM_EMAIL = "system-curriculum@listena.invalid";
const PRIMARY_KEY_PAGE_SIZE = 500;

export type MigrationDatabaseConnection = {
  url: string;
  authToken?: string;
};

export type MigrationVerifierOptions = {
  /** Database whose schema must match the migration contract. */
  target: MigrationDatabaseConnection;
  /** Optional pre-migration database for row-level copy evidence. */
  source?: MigrationDatabaseConnection;
  /** Defaults to `<cwd>/prisma/migrations`. */
  migrationsDirectory?: string;
  /** A contract already derived with `deriveSchemaContract()`; skips re-deriving it. */
  contract?: SchemaContract;
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

export type SchemaDescriptor = {
  tables: TableDescriptor[];
  foreignKeys: ForeignKeyDescriptor[];
  /** One hash per table over its columns and outgoing foreign keys. */
  tableSignatures: Record<string, string>;
  semanticSignature: string;
};

export type IndexInventory = {
  indexes: IndexDescriptor[];
  /** One hash per named index over its keys, uniqueness, and SQL signatures. */
  indexSignatures: Record<string, string>;
  semanticSignature: string;
};

/**
 * The expected shape of a migrated database, derived from the migration
 * files. It is schema-only: the contract has no opinion about row content.
 */
export type SchemaContract = {
  migrations: string[];
  tables: string[];
  namedIndexes: string[];
  foreignKeyCount: number;
  schema: SchemaDescriptor;
  indexes: IndexInventory;
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
  schema: SchemaDescriptor;
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
  contract: {
    migrations: string[];
    tableCount: number;
    namedIndexCount: number;
    foreignKeyCount: number;
    schemaSignature: string;
    indexSignature: string;
  };
  target: DatabaseFingerprint;
  source: DatabaseFingerprint | null;
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

export class MigrationVerifierError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "DATABASE_READ_FAILED" | "MIGRATION_APPLY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "MigrationVerifierError";
  }
}

export function quoteIdentifier(identifier: string) {
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

/** libSQL wants forward slashes in `file:` URLs even on Windows. */
export function sqliteFileUrl(filePath: string) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

/**
 * Lists the Prisma migration directories in the order Prisma applies them
 * (lexical directory-name order, timestamps first).
 */
export async function listPrismaMigrations(
  migrationsDirectory: string = path.resolve(
    process.cwd(),
    DEFAULT_MIGRATIONS_DIRECTORY,
  ),
) {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(migrationsDirectory, { withFileTypes: true });
  } catch {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      "The Prisma migrations directory could not be read.",
    );
  }
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (migrations.length === 0) {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      "The Prisma migrations directory contains no migration.",
    );
  }
  return migrations;
}

/**
 * Applies every checked-in migration to `client` through plain libSQL, the
 * same way the production runbook applies them with `turso db shell`. No
 * `_prisma_migrations` bookkeeping table is created. Only ever call this on a
 * throw-away database.
 */
export async function applyPrismaMigrations(
  client: Client,
  migrationsDirectory: string = path.resolve(
    process.cwd(),
    DEFAULT_MIGRATIONS_DIRECTORY,
  ),
) {
  const migrations = await listPrismaMigrations(migrationsDirectory);
  for (const migration of migrations) {
    let sql: string;
    try {
      sql = await readFile(
        path.join(migrationsDirectory, migration, MIGRATION_FILE_NAME),
        "utf8",
      );
    } catch {
      throw new MigrationVerifierError(
        "INVALID_INPUT",
        `Migration ${migration} has no ${MIGRATION_FILE_NAME}.`,
      );
    }
    try {
      await client.executeMultiple(sql);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new MigrationVerifierError(
        "MIGRATION_APPLY_FAILED",
        `Migration ${migration} failed to apply to the temporary database: ${detail}`,
      );
    }
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return migrations;
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
    .filter(
      (name): name is string =>
        name !== null && !IGNORED_INFRASTRUCTURE_TABLES.has(name),
    );
}

async function readSchema(
  client: Client,
  tables: string[],
): Promise<SchemaDescriptor> {
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
  const tableSignatures: Record<string, string> = {};
  for (const table of normalizedTables) {
    tableSignatures[table.name] = hashDescriptor({
      columns: table.columns,
      foreignKeys: normalizedForeignKeys.filter(
        (foreignKey) => foreignKey.childTable === table.name,
      ),
    });
  }
  return {
    tables: normalizedTables,
    foreignKeys: normalizedForeignKeys,
    tableSignatures,
    semanticSignature: hashDescriptor({
      tables: normalizedTables,
      foreignKeys: normalizedForeignKeys,
    }),
  };
}

async function readIndexInventory(
  client: Client,
  tables: string[],
): Promise<IndexInventory> {
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
  const indexSignatures: Record<string, string> = {};
  for (const index of normalizedIndexes) {
    indexSignatures[index.name] = hashDescriptor(index);
  }
  return {
    indexes: normalizedIndexes,
    indexSignatures,
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

/**
 * Curriculum evidence around the historical Plan05/Plan07 core course. It is
 * reported for both databases and compared source-vs-target; it is no longer
 * a fixed pass/fail target because a production database created by
 * `scripts/import-dataset.ts` receives fresh identifiers.
 */
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

  return {
    available: true,
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

async function removeTemporaryDirectory(directory: string) {
  try {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  } catch {
    // A leftover empty temp directory is harmless; never fail a report on it.
  }
}

/**
 * Builds the expected contract by migrating a throw-away SQLite database in
 * the OS temp directory and fingerprinting it with the verifier's own
 * schema reader.
 */
export async function deriveSchemaContract(
  migrationsDirectory: string = path.resolve(
    process.cwd(),
    DEFAULT_MIGRATIONS_DIRECTORY,
  ),
): Promise<SchemaContract> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "listenai-migration-contract-"),
  );
  const client = createClient({
    url: sqliteFileUrl(path.join(directory, "contract.db")),
    intMode: "string",
  });
  try {
    const migrations = await applyPrismaMigrations(client, migrationsDirectory);
    const tables = await readApplicationTableNames(client);
    const schema = await readSchema(client, tables);
    const indexes = await readIndexInventory(client, tables);
    return {
      migrations,
      tables,
      namedIndexes: indexes.indexes.map((index) => index.name).sort(),
      foreignKeyCount: schema.foreignKeys.length,
      schema,
      indexes,
    };
  } catch (error) {
    if (error instanceof MigrationVerifierError) throw error;
    throw new MigrationVerifierError(
      "MIGRATION_APPLY_FAILED",
      "Unable to derive the migration contract from the temporary database.",
    );
  } finally {
    client.close();
    await removeTemporaryDirectory(directory);
  }
}

export async function fingerprintMigrationDatabase(
  connection: MigrationDatabaseConnection,
  contract: SchemaContract,
): Promise<DatabaseFingerprint> {
  const client = createReadClient(connection);
  try {
    const actualTableNames = await readApplicationTableNames(client);
    const expectedTables = new Set(contract.tables);
    const actualTableSet = new Set(actualTableNames);
    const missingExpected = contract.tables.filter(
      (table) => !actualTableSet.has(table),
    );
    const unexpected = actualTableNames.filter(
      (table) => !expectedTables.has(table),
    );
    // A surprise table is itself a blocking mismatch. Do not recursively scan
    // unknown application data: the evidence surface is the migration contract.
    const verifiedTables = contract.tables.filter((table) =>
      actualTableSet.has(table),
    );
    const schema = await readSchema(client, verifiedTables);
    const indexInventory = await readIndexInventory(client, verifiedTables);
    const actualIndexNames = indexInventory.indexes
      .map((index) => index.name)
      .sort();
    const expectedIndexes = new Set(contract.namedIndexes);
    const actualIndexSet = new Set(actualIndexNames);
    const missingIndexes = contract.namedIndexes.filter(
      (name) => !actualIndexSet.has(name),
    );
    const unexpectedIndexes = actualIndexNames.filter(
      (name) => !expectedIndexes.has(name),
    );
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
        expectedCount: contract.tables.length,
        actual: actualTableNames,
        missingExpected,
        unexpected,
        matchesExpected:
          missingExpected.length === 0 &&
          unexpected.length === 0 &&
          actualTableNames.length === contract.tables.length,
      },
      schema,
      namedIndexes: {
        expectedCount: contract.namedIndexes.length,
        actual: indexInventory.indexes,
        missingExpected: missingIndexes,
        unexpected: unexpectedIndexes,
        matchesExpected:
          missingIndexes.length === 0 &&
          unexpectedIndexes.length === 0 &&
          actualIndexNames.length === contract.namedIndexes.length,
        semanticSignature: indexInventory.semanticSignature,
      },
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

function compareWithContract(
  label: "source" | "target",
  fingerprint: DatabaseFingerprint,
  contract: SchemaContract,
  add: (mismatch: VerificationMismatch) => void,
) {
  if (!fingerprint.applicationTables.matchesExpected) {
    add({
      code: "APPLICATION_TABLE_SET",
      subject: label,
      source: `missing:${fingerprint.applicationTables.missingExpected.join(",") || "-"}`,
      target: `unexpected:${fingerprint.applicationTables.unexpected.join(",") || "-"}`,
    });
  }
  if (!fingerprint.namedIndexes.matchesExpected) {
    add({
      code: "NAMED_INDEX_SET",
      subject: label,
      source: `missing:${fingerprint.namedIndexes.missingExpected.join(",") || "-"}`,
      target: `unexpected:${fingerprint.namedIndexes.unexpected.join(",") || "-"}`,
    });
  }
  if (fingerprint.schema.foreignKeys.length !== contract.foreignKeyCount) {
    add({
      code: "FOREIGN_KEY_COUNT",
      subject: label,
      source: String(contract.foreignKeyCount),
      target: String(fingerprint.schema.foreignKeys.length),
    });
  }
  if (
    fingerprint.schema.semanticSignature !== contract.schema.semanticSignature
  ) {
    // Name every table whose columns/foreign keys differ so an operator can
    // act on the mismatch without the raw DDL.
    const differing = contract.tables.filter(
      (table) =>
        fingerprint.schema.tableSignatures[table] !== undefined &&
        fingerprint.schema.tableSignatures[table] !==
          contract.schema.tableSignatures[table],
    );
    add({
      code: "SEMANTIC_SCHEMA",
      subject: label,
      target: differing.length > 0 ? differing.join(",") : "table-set",
    });
  }
  if (
    fingerprint.namedIndexes.semanticSignature !==
    contract.indexes.semanticSignature
  ) {
    const differing = contract.namedIndexes.filter((name) => {
      const actual = fingerprint.namedIndexes.actual.find(
        (index) => index.name === name,
      );
      return (
        actual !== undefined &&
        hashDescriptor(actual) !== contract.indexes.indexSignatures[name]
      );
    });
    add({
      code: "SEMANTIC_INDEX",
      subject: label,
      target: differing.length > 0 ? differing.join(",") : "index-set",
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
}

function compareSourceAndTarget(
  source: DatabaseFingerprint,
  target: DatabaseFingerprint,
  add: (mismatch: VerificationMismatch) => void,
) {
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

  if (JSON.stringify(source.curriculum) !== JSON.stringify(target.curriculum)) {
    add({ code: "CORE_CURRICULUM", subject: "source-target" });
  }
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
  validateConnection(options.target, "target");
  if (!options.source) return;
  validateConnection(options.source, "source");
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
  const contract =
    options.contract ??
    (await deriveSchemaContract(
      options.migrationsDirectory
        ? path.resolve(options.migrationsDirectory)
        : undefined,
    ));
  const [target, source] = await Promise.all([
    fingerprintMigrationDatabase(options.target, contract),
    options.source
      ? fingerprintMigrationDatabase(options.source, contract)
      : Promise.resolve(null),
  ]);

  const mismatches: VerificationMismatch[] = [];
  const add = (mismatch: VerificationMismatch) => mismatches.push(mismatch);
  compareWithContract("target", target, contract, add);
  if (source) {
    compareWithContract("source", source, contract, add);
    compareSourceAndTarget(source, target, add);
  }
  const passed = mismatches.length === 0;

  return {
    status: passed ? "passed" : "failed",
    contract: {
      migrations: contract.migrations,
      tableCount: contract.tables.length,
      namedIndexCount: contract.namedIndexes.length,
      foreignKeyCount: contract.foreignKeyCount,
      schemaSignature: contract.schema.semanticSignature,
      indexSignature: contract.indexes.semanticSignature,
    },
    target,
    source,
    comparison: { passed, mismatches },
    stagingTimestampProbe: {
      status: "not-run",
      reason:
        "This verifier is intentionally read-only. Perform any staging-only Prisma/raw-libSQL write-read-delete proof through a separately approved operator procedure after the target identity is verified.",
    },
    coverage: {
      performed: [
        `migration contract derived from ${contract.migrations.length} checked-in Prisma migrations applied to a temporary SQLite file (${contract.tables.length} tables, ${contract.namedIndexes.length} named indexes, ${contract.foreignKeyCount} foreign keys)`,
        "exact application-table inventory against the contract (d1_migrations and _prisma_migrations ignored)",
        "semantic columns, defaults, foreign keys, and named indexes including partial/expression indexes through normalized SQL signatures",
        "PRAGMA foreign_key_check, integrity_check, and quick_check",
        ...(source
          ? [
              "source-vs-target per-table row counts and deterministic redacted primary-key SHA-256 fingerprints",
              "source-vs-target per-timestamp storage-class, UTC-day bucket, null, min/max, and parseability summaries",
              "source-vs-target curriculum summary (system owner, core course, lessons, segments, exercises, vocabulary joins)",
            ]
          : [
              "no source database supplied: row counts, primary-key fingerprints, timestamps, and curriculum are reported for the target only",
            ]),
      ],
      gaps: [
        "This verifier does not export or import data, create Turso databases, deploy Vercel, change DNS, or establish a maintenance/export fence.",
        "This verifier never writes a timestamp probe. A staging-only Prisma/raw-libSQL write-read-delete proof requires separate, recorded operator approval after independently verifying the target database identity.",
        "It cannot prove a remote source remained immutable between independent read queries; run it inside the approved export fence and compare pre/post source reports.",
        "It fingerprints primary keys and reports counts, not non-key learner content or row-by-row non-key values. scripts/verify-backup-restore.ts hashes full rows for the backup drill.",
        "CHECK constraints are part of the table DDL but are not surfaced by PRAGMA table_info; they are not compared.",
      ],
    },
  };
}

/**
 * Migrates a throw-away database and verifies it against the contract. A
 * second, negative pass drops one named index and must fail, so a green
 * self-test proves the verifier can still detect drift.
 */
export async function runSelfTest(migrationsDirectory?: string) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "listenai-migration-selftest-"),
  );
  const databasePath = path.join(directory, "self-test.db");
  const client = createClient({ url: sqliteFileUrl(databasePath) });
  try {
    await applyPrismaMigrations(
      client,
      migrationsDirectory ? path.resolve(migrationsDirectory) : undefined,
    );
    const positive = await verifyMigration({
      target: { url: sqliteFileUrl(databasePath) },
      migrationsDirectory,
    });

    const droppedIndex = positive.target.namedIndexes.actual[0]?.name ?? null;
    if (droppedIndex) {
      await client.execute(`DROP INDEX ${quoteIdentifier(droppedIndex)}`);
    }
    const negative = await verifyMigration({
      target: { url: sqliteFileUrl(databasePath) },
      migrationsDirectory,
    });

    const negativeDetected =
      droppedIndex !== null &&
      negative.status === "failed" &&
      negative.comparison.mismatches.some(
        (mismatch) => mismatch.code === "NAMED_INDEX_SET",
      );
    return {
      status:
        positive.status === "passed" && negativeDetected
          ? ("passed" as const)
          : ("failed" as const),
      contract: positive.contract,
      positive: {
        status: positive.status,
        mismatches: positive.comparison.mismatches,
      },
      negative: {
        droppedIndex,
        status: negative.status,
        detected: negativeDetected,
      },
    };
  } finally {
    client.close();
    await removeTemporaryDirectory(directory);
  }
}

type ParsedCli =
  | MigrationVerifierOptions
  | { help: true }
  | { selfTest: true; migrationsDirectory?: string };

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseFlagValues(args: string[]) {
  const values = new Map<string, string>();
  let selfTest = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h")
      return { values, help: true, selfTest };
    if (argument === "--self-test") {
      selfTest = true;
      continue;
    }

    const matched =
      /^(--(?:source-url|target-url|source-token|target-token|migrations-dir))(?:=(.*))?$/.exec(
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

  return { values, help: false, selfTest };
}

export function parseMigrationVerifierCli(
  args: string[] = process.argv.slice(2),
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ParsedCli {
  const parsed = parseFlagValues(args);
  if (parsed.help) return { help: true };
  const migrationsDirectory = parsed.values.get("--migrations-dir");
  if (parsed.selfTest) {
    return {
      selfTest: true,
      ...(migrationsDirectory ? { migrationsDirectory } : {}),
    };
  }

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
  if (!targetUrl) {
    throw new MigrationVerifierError(
      "INVALID_INPUT",
      "An explicit target URL is required through --target-url or MIGRATION_TARGET_DATABASE_URL (add --source-url / MIGRATION_SOURCE_DATABASE_URL for copy evidence).",
    );
  }
  return {
    target: {
      url: targetUrl,
      ...(targetToken ? { authToken: targetToken } : {}),
    },
    ...(sourceUrl
      ? {
          source: {
            url: sourceUrl,
            ...(sourceToken ? { authToken: sourceToken } : {}),
          },
        }
      : {}),
    ...(migrationsDirectory ? { migrationsDirectory } : {}),
  };
}

function usage() {
  return [
    "Usage: npm run migration:verify -- --target-url <file:|libsql:|https:> [--source-url <...>] [--migrations-dir prisma/migrations]",
    "       npm run migration:verify -- --self-test",
    "The expected schema is derived by applying prisma/migrations/** to a temporary SQLite file; the target must match it exactly.",
    "Prefer MIGRATION_TARGET_DATABASE_URL, MIGRATION_SOURCE_DATABASE_URL, and the matching *_AUTH_TOKEN environment variables so credentials do not enter shell history.",
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
    if ("selfTest" in options) {
      const result = await runSelfTest(options.migrationsDirectory);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status !== "passed") process.exitCode = 1;
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
