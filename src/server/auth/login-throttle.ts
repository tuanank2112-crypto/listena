import { createHash, randomUUID } from "node:crypto";
import { executeAtomicLibSqlBatch, libSqlTimestamp } from "@/lib/libsql-batch";
import logger from "@/lib/logger";
import { getAtomicLibSqlClient } from "@/lib/prisma";

/**
 * Credentials login throttle (Plan13 P130, finding A2).
 *
 * Failed sign-ins are counted per normalized email and per client IP in the
 * `AuthAttempt` table, so the limit holds across Vercel lambdas. Reaching a
 * limit inside the window locks that subject for `LOGIN_LOCK_MS`; a successful
 * sign-in clears the email row. The lock message never distinguishes a real
 * account from an unknown one.
 *
 * Every function here fails OPEN: a database error is logged and the login
 * proceeds as if no throttle existed. Locking people out because the database
 * is flapping would be worse than a short window without brute-force limits.
 */

export const LOGIN_FAILURE_WINDOW_MS = 10 * 60_000;
export const LOGIN_LOCK_MS = 15 * 60_000;
export const LOGIN_EMAIL_FAILURE_LIMIT = 5;
export const LOGIN_IP_FAILURE_LIMIT = 20;

export const UNKNOWN_CLIENT_IP = "unknown";

export type LoginSubjects = {
  /** sha256 hex of the normalized email. */
  emailKey: string;
  /** sha256 hex of the client IP (or of "unknown"). */
  ipKey: string;
};

type SubjectKind = "EMAIL" | "IP";

export function hashLoginSubject(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** First `x-forwarded-for` hop, then `x-real-ip`, else `unknown`. */
export function clientIpFromRequest(request: Pick<Request, "headers"> | undefined): string {
  const forwarded = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request?.headers?.get("x-real-ip")?.trim();
  return realIp || UNKNOWN_CLIENT_IP;
}

export function loginSubjects(
  normalizedEmail: string,
  request: Pick<Request, "headers"> | undefined,
): LoginSubjects {
  return {
    emailKey: hashLoginSubject(normalizedEmail),
    ipKey: hashLoginSubject(clientIpFromRequest(request)),
  };
}

function parseStoredTimestamp(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * True when either subject holds an unexpired lock. Reads only; a database
 * error yields `false` (fail open) and a warning.
 */
export async function isLoginLocked(subjects: LoginSubjects, now = new Date()): Promise<boolean> {
  try {
    const result = await getAtomicLibSqlClient().execute({
      sql: `SELECT "lockedUntil"
            FROM "AuthAttempt"
            WHERE ("subjectKind" = 'EMAIL' AND "subject" = ?)
               OR ("subjectKind" = 'IP' AND "subject" = ?)`,
      args: [subjects.emailKey, subjects.ipKey],
    });
    const nowMs = now.getTime();
    return result.rows.some((row) => {
      const lockedUntil = parseStoredTimestamp((row as { lockedUntil?: unknown }).lockedUntil);
      return lockedUntil !== null && lockedUntil > nowMs;
    });
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : "unknown" },
      "Login throttle lookup failed; continuing without a lock check",
    );
    return false;
  }
}

/**
 * One atomic upsert per subject: reset the window when it has expired,
 * otherwise increment, and set the lock the moment the limit is reached.
 * Both subjects are updated in one libSQL batch.
 */
function failureUpsert(
  kind: SubjectKind,
  subject: string,
  limit: number,
  now: Date,
) {
  const timestamp = libSqlTimestamp(now);
  const windowCutoff = libSqlTimestamp(new Date(now.getTime() - LOGIN_FAILURE_WINDOW_MS));
  const lockUntil = libSqlTimestamp(new Date(now.getTime() + LOGIN_LOCK_MS));
  const nextCount = `CASE WHEN "AuthAttempt"."windowStartedAt" < ? THEN 1 ELSE "AuthAttempt"."failedCount" + 1 END`;
  return {
    sql: `INSERT INTO "AuthAttempt"
            ("id", "subjectKind", "subject", "failedCount", "windowStartedAt", "lockedUntil", "updatedAt")
          VALUES (?, ?, ?, 1, ?, CASE WHEN 1 >= ? THEN ? ELSE NULL END, ?)
          ON CONFLICT("subjectKind", "subject") DO UPDATE SET
            "failedCount" = ${nextCount},
            "windowStartedAt" = CASE WHEN "AuthAttempt"."windowStartedAt" < ? THEN excluded."windowStartedAt" ELSE "AuthAttempt"."windowStartedAt" END,
            "lockedUntil" = CASE WHEN (${nextCount}) >= ? THEN ? ELSE NULL END,
            "updatedAt" = excluded."updatedAt"`,
    values: [
      randomUUID(),
      kind,
      subject,
      timestamp,
      limit,
      lockUntil,
      timestamp,
      // ON CONFLICT parameters, in order of appearance.
      windowCutoff,
      windowCutoff,
      windowCutoff,
      limit,
      lockUntil,
    ],
  };
}

/** Counts one failed sign-in against both subjects. Fails open on DB errors. */
export async function recordLoginFailure(subjects: LoginSubjects, now = new Date()): Promise<void> {
  try {
    await executeAtomicLibSqlBatch([
      failureUpsert("EMAIL", subjects.emailKey, LOGIN_EMAIL_FAILURE_LIMIT, now),
      failureUpsert("IP", subjects.ipKey, LOGIN_IP_FAILURE_LIMIT, now),
    ]);
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : "unknown" },
      "Login throttle failure record failed; continuing without throttling",
    );
  }
}

/**
 * A correct password clears the email counter. The IP counter is left alone:
 * one valid login from an address must not reset a scan of other accounts.
 */
export async function clearLoginFailures(subjects: LoginSubjects): Promise<void> {
  try {
    await executeAtomicLibSqlBatch([
      {
        sql: `DELETE FROM "AuthAttempt" WHERE "subjectKind" = 'EMAIL' AND "subject" = ?`,
        values: [subjects.emailKey],
      },
    ]);
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : "unknown" },
      "Login throttle clear failed; stale counter may remain",
    );
  }
}
