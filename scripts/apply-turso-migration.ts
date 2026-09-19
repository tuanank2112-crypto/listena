/**
 * Apply one checked-in Prisma migration to a libSQL/Turso database, and prove
 * what happened (Plan22 SPEC OPERATIONS §1).
 *
 * `prisma migrate deploy` needs a shadow database and a Prisma engine pointed
 * at the target; against a remote Turso database that is more moving parts than
 * an additive migration deserves. This applies exactly the SQL that is checked
 * in, in one atomic batch, and then reports the schema it left behind.
 *
 * Safety rules this tool follows and will not be talked out of:
 *   - It applies ONE named migration, never "all pending".
 *   - It refuses a migration that is already recorded, and refuses one whose
 *     objects already exist, rather than half-applying it twice.
 *   - It runs every statement in a single batch, so a failure leaves nothing.
 *   - It never prints the database URL, the token, or any application row.
 *
 * Usage (credentials come from the environment, never from arguments):
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... \
 *     npx tsx scripts/apply-turso-migration.ts --migration 20260920030000_plan22_lesson_journey --check
 *   ... same without --check to apply.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Split a migration file into statements, dropping comments and blank lines. */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Objects a statement creates, so the tool can tell "already applied" apart from "new". */
function createdObject(statement: string): { kind: "table" | "index"; name: string } | null {
  const table = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/i.exec(statement);
  if (table) return { kind: "table", name: table[1] };
  const index = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/i.exec(statement);
  if (index) return { kind: "index", name: index[1] };
  return null;
}

function alteredColumn(statement: string): { table: string; column: string } | null {
  const match = /ALTER\s+TABLE\s+"?([A-Za-z0-9_]+)"?\s+ADD\s+COLUMN\s+"?([A-Za-z0-9_]+)"?/i.exec(statement);
  return match ? { table: match[1], column: match[2] } : null;
}

async function objectExists(db: Client, name: string): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1`,
    args: [name],
  });
  return result.rows.length > 0;
}

async function columnExists(db: Client, table: string, column: string): Promise<boolean> {
  const result = await db.execute(`PRAGMA table_info("${table}")`);
  return result.rows.some((row) => String(row.name) === column);
}

async function hasPrismaLedger(db: Client): Promise<boolean> {
  return objectExists(db, "_prisma_migrations");
}

async function alreadyRecorded(db: Client, migration: string): Promise<boolean> {
  if (!await hasPrismaLedger(db)) return false;
  const result = await db.execute({
    sql: `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ? LIMIT 1`,
    args: [migration],
  });
  return result.rows.length > 0;
}

async function report(db: Client, label: string) {
  const [tables, indexes, integrity, foreignKeys] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`),
    db.execute(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`),
    db.execute(`PRAGMA integrity_check`),
    db.execute(`PRAGMA foreign_key_check`),
  ]);
  console.log(`${label}: tables=${tables.rows[0]?.n} indexes=${indexes.rows[0]?.n}`
    + ` integrity=${integrity.rows[0]?.integrity_check}`
    + ` foreign_key_violations=${foreignKeys.rows.length}`);
}

async function main() {
  const migration = argValue("migration");
  const checkOnly = process.argv.includes("--check");
  if (!migration) throw new Error("Pass --migration <directory name>");

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");

  const file = path.join(MIGRATIONS_DIR, migration, "migration.sql");
  const sql = await readFile(file, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const statements = splitStatements(sql);
  console.log(`migration=${migration} statements=${statements.length} sha256=${checksum.slice(0, 16)}…`);

  const db = createClient(authToken ? { url, authToken } : { url });
  try {
    await report(db, "before");

    if (await alreadyRecorded(db, migration)) {
      console.log("SKIP: this migration is already recorded in _prisma_migrations.");
      return;
    }

    // Decide, statement by statement, whether the target already has it. A
    // migration that is partly present is a state a human must look at, not
    // something to paper over.
    const present: string[] = [];
    const missing: string[] = [];
    for (const statement of statements) {
      const object = createdObject(statement);
      const column = alteredColumn(statement);
      const exists = object
        ? await objectExists(db, object.name)
        : column
          ? await columnExists(db, column.table, column.column)
          : false;
      const label = object ? `${object.kind} ${object.name}` : column ? `column ${column.table}.${column.column}` : statement.slice(0, 40);
      (exists ? present : missing).push(label);
    }
    console.log(`already present: ${present.length ? present.join(", ") : "(none)"}`);
    console.log(`to apply:       ${missing.length ? missing.join(", ") : "(none)"}`);

    if (present.length && missing.length) {
      throw new Error("Partly applied: some objects exist and some do not. Resolve by hand before running this.");
    }
    if (!missing.length) {
      console.log("Nothing to do: every object already exists.");
      return;
    }
    if (checkOnly) {
      console.log("--check: nothing was written.");
      return;
    }

    await db.batch(statements, "write");
    console.log(`applied ${statements.length} statements`);

    if (await hasPrismaLedger(db)) {
      await db.execute({
        sql: `INSERT INTO "_prisma_migrations"
                ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
              VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, ?)`,
        args: [crypto.randomUUID(), checksum, migration, statements.length],
      });
      console.log("recorded in _prisma_migrations");
    } else {
      console.log("no _prisma_migrations table on this target; nothing recorded");
    }

    await report(db, "after");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  // Never let a driver error print the connection it was using.
  console.error("FAILED:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
