import { DatabaseUnavailableError } from "@/lib/database-errors";
import { getAtomicLibSqlClient, toLibSqlTimestamp } from "@/lib/prisma";

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

/** Uses the same timestamp representation as the active Prisma libSQL client. */
export function libSqlTimestamp(value: Date) {
  return toLibSqlTimestamp(value);
}

export function libSqlBoolean(value: boolean) {
  return value ? 1 : 0;
}
