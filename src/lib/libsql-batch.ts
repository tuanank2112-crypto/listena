import {
  DatabaseUnavailableError,
  isDatabaseUnavailableError,
} from "@/lib/database-errors";
import { getAtomicLibSqlClient, toLibSqlTimestamp } from "@/lib/prisma";
import { resolveDatabaseConfig, type DatabaseEnvironment } from "@/lib/database-config";

export {
  DATABASE_UNAVAILABLE,
  DatabaseUnavailableError,
  isDatabaseUnavailableError,
} from "@/lib/database-errors";

export type LibSqlBatchValue = string | number | null;

export type LibSqlBatchStatement = {
  sql: string;
  values?: LibSqlBatchValue[];
};

export type AtomicLibSqlBatchResult = {
  changes: number;
};

function isIntegrityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return (typeof code === "string" && /^SQLITE_CONSTRAINT/i.test(code))
    || /(?:SQLITE_CONSTRAINT|UNIQUE constraint failed|FOREIGN KEY constraint failed|NOT NULL constraint failed|CHECK constraint failed)/i.test(message);
}

/**
 * Runs a parameterized SQLite/libSQL write batch. The backing client commits
 * every statement or rolls the whole batch back, so these narrow persistence
 * boundaries retain their CAS and idempotency fences on local SQLite and
 * remote Turso alike.
 */
export async function executeAtomicLibSqlBatch(
  statements: LibSqlBatchStatement[],
): Promise<AtomicLibSqlBatchResult[]> {
  if (statements.length === 0) return [];

  // Resolve configuration before the catch: deployment misconfiguration is
  // actionable and must remain a DatabaseConfigurationError for callers.
  const client = getAtomicLibSqlClient();
  try {
    const results = await client.batch(
      statements.map(({ sql, values = [] }) => ({ sql, args: values })),
     "write",
    );
    return results.map((result) => ({ changes: Number(result.rowsAffected) }));
  } catch (error) {
    if (isIntegrityError(error)) throw error;
    throw new DatabaseUnavailableError();
  }
}

export function rowAs<T>(row: import("@libsql/client").Row): T {
  return row as unknown as T;
}

const BUSY_RETRY_DELAYS_MS = [10, 20, 40, 80, 160];

function isBusyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  return /BUSY|LOCKED/i.test(code) || /busy|locked/i.test(message);
}

async function beginWriteTransactionWithRetry(
  client: import("@libsql/client").Client
): Promise<import("@libsql/client").Transaction> {
  let attempt = 0;
  while (true) {
    try {
      return await client.transaction("write");
    } catch (error) {
      if (isBusyError(error) && attempt < BUSY_RETRY_DELAYS_MS.length) {
        const delay = BUSY_RETRY_DELAYS_MS[attempt] ?? 160;
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (isIntegrityError(error)) throw error;
      throw new DatabaseUnavailableError();
    }
  }
}

// Process mutex is local/E2E only to serialize file-backed SQLite transactions; Turso serializes at server.
let localFileTxLockTail: Promise<void> = Promise.resolve();

export function shouldSerializeLocally(env: DatabaseEnvironment = process.env): boolean {
  try {
    return resolveDatabaseConfig(env).runtime === "local-sqlite";
  } catch {
    return false; // fail-safe: không bật mutex khi cấu hình không xác định
  }
}

function acquireLocalFileTxLock(): Promise<() => void> {
  if (!shouldSerializeLocally()) {
    return Promise.resolve(() => {});
  }
  let release!: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = localFileTxLockTail;
  localFileTxLockTail = localFileTxLockTail.then(() => nextLock);
  return currentLock.then(() => release);
}

function isDriverError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "LibsqlError") return true;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  if (/^(SQLITE_|LIBSQL_)/i.test(code)) return true;
  if ("rawCode" in error && typeof (error as { rawCode?: unknown }).rawCode === "number") return true;
  return false;
}

type TxHook = (tx: import("@libsql/client").Transaction) => import("@libsql/client").Transaction;
let activeTxHook: TxHook | null = null;

export function setTxHookForTesting(hook: TxHook | null): void {
  activeTxHook = hook;
}

export function getTxHookForTesting(): TxHook | null {
  return activeTxHook;
}

export async function withLibSqlWriteTransaction<T>(
  run: (tx: import("@libsql/client").Transaction) => Promise<T>
): Promise<T> {
  const unlock = await acquireLocalFileTxLock();
  let tx: import("@libsql/client").Transaction | undefined;
  let committed = false;

  try {
    const client = getAtomicLibSqlClient();
    const rawTx = await beginWriteTransactionWithRetry(client);
    tx = activeTxHook ? activeTxHook(rawTx) : rawTx;

    const result = await run(tx);
    await tx.commit();
    committed = true;
    return result;
  } catch (error) {
    if (tx && !committed) {
      try {
        await tx.rollback();
      } catch {
        // Rollback failure shouldn't mask original error
      }
    }
    if (isIntegrityError(error)) throw error;
    if (isDatabaseUnavailableError(error)) throw error;
    if (isDriverError(error)) {
      throw new DatabaseUnavailableError();
    }
    throw error;
  } finally {
    try {
      tx?.close();
    } catch {
      // Ignore close errors
    }
    unlock();
  }
}

/** Uses the same timestamp representation as the active Prisma libSQL client. */
export function libSqlTimestamp(value: Date) {
  return toLibSqlTimestamp(value);
}

export function libSqlBoolean(value: boolean) {
  return value ? 1 : 0;
}
