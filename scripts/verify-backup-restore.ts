/**
 * Backup & restore drill on the real schema (Plan13 SPEC-P134 §2, finding D4).
 *
 * Everything happens inside a fresh directory under the OS temp directory:
 *
 *   1. apply every `prisma/migrations/** /migration.sql` to `source.db` with
 *      libSQL (the same way the production runbook applies them);
 *   2. run the real `prisma/seed.ts` and `scripts/import-dataset.ts` against
 *      that file (child processes with DATABASE_URL pointing at the temp file
 *      and every hosted/Turso variable removed);
 *   3. export every application table to JSON (typed cells, blobs base64);
 *   4. migrate a brand-new `restored.db` and re-import the JSON export;
 *   5. compare source and restored per table: row count plus a SHA-256 over
 *      every column of every row (ordered by primary key), then run
 *      PRAGMA foreign_key_check / integrity_check, and finally the read-only
 *      migration verifier (schema contract + primary-key fingerprints).
 *
 * The drill prints the real table and row counts it observed. It never
 * touches `prisma/dev.db`, a hosted database, or any file outside its temp
 * directory, and it exits non-zero on the first table that does not match.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client, type InStatement, type Row } from "@libsql/client";
import {
  applyPrismaMigrations,
  quoteIdentifier,
  sqliteFileUrl,
  verifyMigration,
} from "./verify-turso-migration";

/** Engine bookkeeping tables are never part of a backup. */
const IGNORED_TABLES = new Set(["_prisma_migrations", "d1_migrations"]);
const PAGE_SIZE = 500;
const INSERT_BATCH_SIZE = 200;
const CHILD_TIMEOUT_MS = 10 * 60 * 1000;

type StorageClass = "null" | "integer" | "real" | "text" | "blob";
/** One exported cell: SQLite storage class + JSON-safe value. */
type ExportedCell = [StorageClass, string | number | null];

type TableExport = {
  table: string;
  columns: string[];
  primaryKey: string[];
  rows: ExportedCell[][];
};

type TableResult = {
  table: string;
  sourceRows: number;
  restoredRows: number;
  sourceHash: string;
  restoredHash: string;
  match: boolean;
};

function openClient(filePath: string): Client {
  // intMode "string" keeps 64-bit integers exact through JSON.
  return createClient({ url: sqliteFileUrl(filePath), intMode: "string" });
}

/**
 * Child processes must only ever see the temp file. Strip every hosted
 * runtime/Turso selector so `resolveDatabaseConfig()` resolves local SQLite.
 */
function childEnvironment(databasePath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    "APP_RUNTIME",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_DEPLOYMENT_ID",
    "VERCEL_REGION",
    "IMPORT_CONFIRM",
  ]) {
    delete env[name];
  }
  env.DATABASE_URL = sqliteFileUrl(databasePath);
  return env;
}

function runTsxScript(label: string, scriptPath: string, databasePath: string) {
  const startedAt = Date.now();
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  try {
    const output = execFileSync(process.execPath, [tsxCli, scriptPath], {
      cwd: process.cwd(),
      env: childEnvironment(databasePath),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: CHILD_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    const lines = output.toString("utf8").split(/\r?\n/).filter(Boolean);
    console.log(`   ${label}: ok in ${Date.now() - startedAt} ms (${lines.length} output lines)`);
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: Buffer | string }).stderr ?? "")
        : "";
    throw new Error(`${label} failed (${scriptPath}).\n${stderr.trim().slice(-4000)}`);
  }
}

async function listApplicationTables(client: Client) {
  const result = await client.execute(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  return result.rows
    .map((row) => String(row.name))
    .filter((name) => !IGNORED_TABLES.has(name));
}

async function describeTable(client: Client, table: string) {
  const info = await client.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
  const columns = info.rows.map((row) => String(row.name));
  const primaryKey = info.rows
    .filter((row) => Number(row.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((row) => String(row.name));
  return { columns, primaryKey };
}

async function parentTables(client: Client, table: string) {
  const list = await client.execute(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`);
  return [...new Set(list.rows.map((row) => String(row.table)))].filter(
    (parent) => parent !== table,
  );
}

/** Parents before children so a fresh database accepts the rows with FKs on. */
async function topologicalOrder(client: Client, tables: string[]) {
  const parents = new Map<string, string[]>();
  for (const table of tables) parents.set(table, await parentTables(client, table));
  const ordered: string[] = [];
  const placed = new Set<string>();
  let progress = true;
  while (progress && ordered.length < tables.length) {
    progress = false;
    for (const table of tables) {
      if (placed.has(table)) continue;
      const pending = (parents.get(table) ?? []).filter(
        (parent) => tables.includes(parent) && !placed.has(parent),
      );
      if (pending.length === 0) {
        ordered.push(table);
        placed.add(table);
        progress = true;
      }
    }
  }
  const cyclic = tables.filter((table) => !placed.has(table));
  return { ordered: [...ordered, ...cyclic], cyclic };
}

function selectSql(table: string, columns: string[], orderBy: string[]) {
  const select = columns
    .flatMap((column, index) => [
      `${quoteIdentifier(column)} AS ${quoteIdentifier(`v${index}`)}`,
      `typeof(${quoteIdentifier(column)}) AS ${quoteIdentifier(`t${index}`)}`,
    ])
    .join(", ");
  const order = orderBy.map((column) => `${quoteIdentifier(column)} COLLATE BINARY`).join(", ");
  return `SELECT ${select} FROM ${quoteIdentifier(table)} ORDER BY ${order} LIMIT ? OFFSET ?`;
}

async function* pageRows(client: Client, sql: string) {
  let offset = 0;
  while (true) {
    const result = await client.execute({ sql, args: [PAGE_SIZE, offset] });
    for (const row of result.rows) yield row;
    if (result.rows.length < PAGE_SIZE) return;
    offset += result.rows.length;
  }
}

function encodeCell(row: Row, index: number): ExportedCell {
  const storageClass = String(row[`t${index}`]) as StorageClass;
  const value = row[`v${index}`];
  if (value === null || value === undefined) return ["null", null];
  if (value instanceof ArrayBuffer) return ["blob", Buffer.from(value).toString("base64")];
  if (storageClass === "real") return ["real", Number(value)];
  return [storageClass, String(value)];
}

async function exportTable(client: Client, table: string): Promise<TableExport> {
  const { columns, primaryKey } = await describeTable(client, table);
  const rows: ExportedCell[][] = [];
  const sql = selectSql(table, columns, primaryKey.length > 0 ? primaryKey : columns);
  for await (const row of pageRows(client, sql)) {
    rows.push(columns.map((_, index) => encodeCell(row, index)));
  }
  return { table, columns, primaryKey, rows };
}

function insertStatement(exported: TableExport, row: ExportedCell[]): InStatement {
  const placeholders: string[] = [];
  const values: Array<string | number | bigint | Uint8Array | null> = [];
  for (const [storageClass, value] of row) {
    switch (storageClass) {
      case "null":
        placeholders.push("?");
        values.push(null);
        break;
      case "integer":
        placeholders.push("?");
        values.push(BigInt(String(value)));
        break;
      case "real":
        // Force REAL storage so an integral double (1.0) is not re-typed.
        placeholders.push("CAST(? AS REAL)");
        values.push(Number(value));
        break;
      case "blob":
        placeholders.push("?");
        values.push(new Uint8Array(Buffer.from(String(value), "base64")));
        break;
      default:
        placeholders.push("?");
        values.push(String(value));
    }
  }
  const columnList = exported.columns.map(quoteIdentifier).join(", ");
  return {
    sql: `INSERT INTO ${quoteIdentifier(exported.table)} (${columnList}) VALUES (${placeholders.join(", ")})`,
    args: values,
  };
}

async function importTable(client: Client, exported: TableExport) {
  for (let start = 0; start < exported.rows.length; start += INSERT_BATCH_SIZE) {
    const chunk = exported.rows.slice(start, start + INSERT_BATCH_SIZE);
    await client.batch(
      chunk.map((row) => insertStatement(exported, row)),
      "write",
    );
  }
}

async function hashTable(client: Client, table: string) {
  const { columns, primaryKey } = await describeTable(client, table);
  const hash = createHash("sha256");
  hash.update(`table:${table}\ncolumns:${columns.join(",")}\n`);
  let count = 0;
  const sql = selectSql(table, columns, primaryKey.length > 0 ? primaryKey : columns);
  for await (const row of pageRows(client, sql)) {
    for (let index = 0; index < columns.length; index += 1) {
      const [storageClass, value] = encodeCell(row, index);
      hash.update(`${storageClass}:`);
      if (value === null) {
        hash.update("NULL;");
      } else {
        const bytes = Buffer.from(String(value), "utf8");
        hash.update(`${bytes.byteLength}:`);
        hash.update(bytes);
        hash.update(";");
      }
    }
    hash.update("\n");
    count += 1;
  }
  return { count, sha256: hash.digest("hex") };
}

async function checkIntegrity(client: Client, label: string) {
  const [foreignKeys, integrity] = await Promise.all([
    client.execute("PRAGMA foreign_key_check"),
    client.execute("PRAGMA integrity_check"),
  ]);
  const integrityOk = integrity.rows.length === 1 && String(integrity.rows[0][0]).toLowerCase() === "ok";
  console.log(
    `   ${label}: foreign_key_check violations=${foreignKeys.rows.length}, integrity_check=${integrityOk ? "ok" : "FAILED"}`,
  );
  if (foreignKeys.rows.length > 0 || !integrityOk) {
    throw new Error(`${label} failed PRAGMA foreign_key_check/integrity_check`);
  }
}

function padEnd(value: string | number, width: number) {
  return String(value).padEnd(width);
}

async function main() {
  console.log("==================================================");
  console.log(" ListenAI Backup & Restore Drill (real migrations)");
  console.log("==================================================");

  const workDir = mkdtempSync(path.join(tmpdir(), "listenai-drill-"));
  const sourceDbPath = path.join(workDir, "source.db");
  const exportDir = path.join(workDir, "export");
  const restoredDbPath = path.join(workDir, "restored.db");
  mkdirSync(exportDir, { recursive: true });
  let exitCode = 0;

  try {
    console.log("1. Migrating source database in a temporary directory...");
    const source = openClient(sourceDbPath);
    const migrations = await applyPrismaMigrations(source);
    console.log(`   applied ${migrations.length} migrations (${migrations[0]} .. ${migrations.at(-1)})`);
    source.close();

    console.log("2. Running the real seed and dataset import against the source database...");
    runTsxScript("prisma/seed.ts", path.join("prisma", "seed.ts"), sourceDbPath);
    runTsxScript("scripts/import-dataset.ts", path.join("scripts", "import-dataset.ts"), sourceDbPath);

    console.log("3. Exporting every application table to JSON...");
    const sourceForExport = openClient(sourceDbPath);
    const tables = await listApplicationTables(sourceForExport);
    const exports = new Map<string, TableExport>();
    let exportedRows = 0;
    for (const table of tables) {
      const exported = await exportTable(sourceForExport, table);
      exports.set(table, exported);
      exportedRows += exported.rows.length;
      writeFileSync(path.join(exportDir, `${table}.json`), JSON.stringify(exported));
    }
    const { ordered, cyclic } = await topologicalOrder(sourceForExport, tables);
    sourceForExport.close();
    console.log(`   exported ${tables.length} tables, ${exportedRows} rows`);
    if (cyclic.length > 0) {
      console.log(`   note: foreign-key cycle among ${cyclic.join(", ")}; inserting them last`);
    }

    console.log("4. Migrating a fresh restore target and re-importing the export...");
    const restored = openClient(restoredDbPath);
    await applyPrismaMigrations(restored);
    if (cyclic.length > 0) await restored.execute("PRAGMA foreign_keys = OFF");
    for (const table of ordered) {
      const exported = exports.get(table);
      if (exported) await importTable(restored, exported);
    }
    if (cyclic.length > 0) await restored.execute("PRAGMA foreign_keys = ON");
    await checkIntegrity(restored, "restored.db");
    restored.close();

    console.log("5. Comparing source and restored databases table by table (SHA-256 over all columns)...");
    const sourceForHash = openClient(sourceDbPath);
    const restoredForHash = openClient(restoredDbPath);
    const restoredTables = await listApplicationTables(restoredForHash);
    const allTables = [...new Set([...tables, ...restoredTables])].sort();
    const results: TableResult[] = [];
    for (const table of allTables) {
      const sourceHash = tables.includes(table)
        ? await hashTable(sourceForHash, table)
        : { count: 0, sha256: "missing" };
      const restoredHash = restoredTables.includes(table)
        ? await hashTable(restoredForHash, table)
        : { count: 0, sha256: "missing" };
      results.push({
        table,
        sourceRows: sourceHash.count,
        restoredRows: restoredHash.count,
        sourceHash: sourceHash.sha256,
        restoredHash: restoredHash.sha256,
        match:
          sourceHash.sha256 === restoredHash.sha256 &&
          sourceHash.count === restoredHash.count &&
          sourceHash.sha256 !== "missing",
      });
    }
    sourceForHash.close();
    restoredForHash.close();

    console.log("");
    console.log(`   ${padEnd("Table", 34)}${padEnd("Source", 9)}${padEnd("Restored", 10)}Rows hash`);
    console.log(`   ${"-".repeat(34)}${"-".repeat(9)}${"-".repeat(10)}${"-".repeat(9)}`);
    for (const result of results) {
      console.log(
        `   ${padEnd(result.table, 34)}${padEnd(result.sourceRows, 9)}${padEnd(result.restoredRows, 10)}${result.match ? "match" : "MISMATCH"}`,
      );
    }
    const totalSource = results.reduce((sum, result) => sum + result.sourceRows, 0);
    const totalRestored = results.reduce((sum, result) => sum + result.restoredRows, 0);
    const mismatches = results.filter((result) => !result.match);
    const emptyTables = results.filter((result) => result.sourceRows === 0).length;
    console.log("");
    console.log(
      `   tables: ${results.length} (${emptyTables} empty after seed+import), rows: source=${totalSource} restored=${totalRestored}, mismatching tables: ${mismatches.length}`,
    );

    console.log("6. Running the read-only migration verifier (schema contract, primary-key fingerprints, timestamps)...");
    const report = await verifyMigration({
      source: { url: sqliteFileUrl(sourceDbPath) },
      target: { url: sqliteFileUrl(restoredDbPath) },
    });
    console.log(
      `   verifier: ${report.status} (contract ${report.contract.tableCount} tables / ${report.contract.namedIndexCount} indexes / ${report.contract.foreignKeyCount} foreign keys; mismatches: ${report.comparison.mismatches.length})`,
    );
    for (const mismatch of report.comparison.mismatches) {
      console.log(`     - ${mismatch.code} ${mismatch.subject}`);
    }

    console.log("==================================================");
    if (mismatches.length === 0 && report.status === "passed") {
      console.log(
        `Backup & Restore Drill PASSED: ${results.length}/${results.length} tables, ${totalSource} rows re-imported with identical per-table SHA-256; ignored engine tables: ${[...IGNORED_TABLES].join(", ")}.`,
      );
    } else {
      exitCode = 1;
      console.log(
        `Backup & Restore Drill FAILED: ${mismatches.length} table(s) differ, verifier ${report.status}.`,
      );
    }
    console.log("==================================================");
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    } catch {
      // A leftover temp directory is harmless.
    }
  }
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error("Backup & restore drill failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
