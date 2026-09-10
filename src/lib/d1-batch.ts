import "server-only";

import { getNativeD1Database } from "@/lib/prisma";

export type D1BatchValue = string | number | null;

export type D1BatchStatement = {
  sql: string;
  values?: D1BatchValue[];
};

export type NativeD1BatchResult = {
  success: boolean;
  meta: {
    changes?: number;
  };
};

/**
 * Runs a parameterized, atomic D1 batch. This exists only for the small set
 * of multi-record commits whose invariants cannot be preserved by Prisma's
 * D1 adapter (which has no ACID transaction support).
 */
export async function executeNativeD1Batch(
  statements: D1BatchStatement[],
): Promise<NativeD1BatchResult[]> {
  const database = getNativeD1Database();
  if (!database) {
    throw new Error("Native D1 batch requested outside the Cloudflare Worker runtime");
  }
  if (statements.length === 0) return [];

  const results = await database.batch(
    statements.map(({ sql, values = [] }) => database.prepare(sql).bind(...values)),
  );
  const normalized = results as NativeD1BatchResult[];
  if (normalized.some((result) => !result.success)) {
    throw new Error("Native D1 batch did not commit");
  }
  return normalized;
}

/** Match the timestamp format Prisma's D1 adapter writes to SQLite. */
export function d1Timestamp(value: Date) {
  return value.toISOString().replace("Z", "+00:00");
}

export function d1Boolean(value: boolean) {
  return value ? 1 : 0;
}
