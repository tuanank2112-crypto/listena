import type { Transaction, InStatement, Client } from "@libsql/client";
import { createHash } from "node:crypto";
import {
  withLibSqlWriteTransaction,
  setTxHookForTesting,
  getTxHookForTesting,
} from "@/lib/libsql-batch";
import { getAtomicLibSqlClient } from "@/lib/prisma";

export type FaultPlan = {
  failAtStatementIndex?: number;
  failWhenSqlMatches?: RegExp;
  error?: Error;
};

export const INTEGRITY_TABLES = [
  "Course",
  "VocabularyItem",
  "Lesson",
  "LessonSegment",
  "Exercise",
  "LessonVocabulary",
  "AIInteraction",
  "LessonCreationRequest",
  "Attempt",
  "AttemptError",
  "ReviewLog",
  "VocabularyMastery",
  "LearnerProfile",
  "SkillMastery",
] as const;

export type IntegrityTable = (typeof INTEGRITY_TABLES)[number];

export function createFaultyTx(
  realTx: Transaction,
  plan: FaultPlan
): Transaction {
  let statementIndex = 0;
  return new Proxy(realTx, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return async (stmt: InStatement) => {
          const currentIndex = statementIndex++;
          const sql = typeof stmt === "string" ? stmt : stmt.sql;
          const shouldFailIndex =
            plan.failAtStatementIndex !== undefined &&
            currentIndex === plan.failAtStatementIndex;
          const shouldFailSql =
            plan.failWhenSqlMatches !== undefined &&
            plan.failWhenSqlMatches.test(sql);

          if (shouldFailIndex || shouldFailSql) {
            throw (
              plan.error ??
              new Error(
                `Simulated transaction fault at statement ${currentIndex}: ${sql}`
              )
            );
          }
          return target.execute(stmt);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

/**
 * Runs a libSQL write transaction with statement-level fault injection.
 * When the fault condition is reached, an error is thrown before executing the SQL,
 * triggering a full transaction rollback.
 */
export async function withFaultyWriteTransaction<T>(
  plan: FaultPlan,
  run: (tx: Transaction) => Promise<T>
): Promise<T> {
  const previousHook = getTxHookForTesting();
  setTxHookForTesting((tx) => createFaultyTx(tx, plan));
  try {
    return await withLibSqlWriteTransaction(async (tx) => {
      return run(tx);
    });
  } finally {
    setTxHookForTesting(previousHook);
  }
}

/**
 * Computes deterministic sha256 table fingerprints for the fixed set of integrity tables.
 */
export async function computeTableFingerprints(
  client?: Client,
  tables: readonly string[] = INTEGRITY_TABLES
): Promise<Record<string, string>> {
  const c = client ?? getAtomicLibSqlClient();
  const fingerprints: Record<string, string> = {};

  for (const table of tables) {
    try {
      const res = await c.execute(`SELECT * FROM "${table}"`);
      const serializedRows = res.rows
        .map((row) => JSON.stringify(row))
        .sort()
        .join("\n");
      const hash = createHash("sha256").update(serializedRows).digest("hex");
      fingerprints[table] = `${res.rows.length}:${hash}`;
    } catch (error) {
      fingerprints[table] = `ERR:${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return fingerprints;
}

/**
 * Compares two fingerprint snapshots and returns the list of table names that differ.
 */
export function diffTableFingerprints(
  before: Record<string, string>,
  after: Record<string, string>
): string[] {
  const changed: string[] = [];
  for (const table of Object.keys(before)) {
    if (before[table] !== after[table]) {
      changed.push(table);
    }
  }
  for (const table of Object.keys(after)) {
    if (!before[table] && !changed.includes(table)) {
      changed.push(table);
    }
  }
  return changed;
}
