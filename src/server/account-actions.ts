import { createHash, randomBytes, randomUUID } from "node:crypto";
import { executeAtomicLibSqlBatch, libSqlTimestamp } from "@/lib/libsql-batch";

export type AccountActionPurpose = "VERIFY_EMAIL" | "PASSWORD_RESET";

const TOKEN_BYTES = 32;
const TOKEN_COOLDOWN_MS = 60_000;
const TOKEN_TTL_MS: Record<AccountActionPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

export class AccountActionTokenInvalidError extends Error {
  readonly code = "TOKEN_INVALID";

  constructor() {
    super("Account action token is invalid.");
    this.name = "AccountActionTokenInvalidError";
  }
}

export function isAccountActionTokenInvalidError(error: unknown): error is AccountActionTokenInvalidError {
  return error instanceof AccountActionTokenInvalidError
    || (typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === "TOKEN_INVALID");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashAccountActionToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type IssuedAccountActionToken = {
  rawToken: string;
  expiresAt: Date;
};

/**
 * Issues a one-time action token without persisting its raw value. A durable
 * 60-second per-user/purpose throttle prevents a resend loop; a successful
 * issue consumes older active tokens of the same purpose in the same batch.
 */
export async function issueAccountActionToken(input: {
  userId: string;
  purpose: AccountActionPurpose;
  now?: Date;
}): Promise<IssuedAccountActionToken | undefined> {
  const now = input.now ?? new Date();
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashAccountActionToken(rawToken);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS[input.purpose]);
  const createdAt = libSqlTimestamp(now);
  const expiry = libSqlTimestamp(expiresAt);
  const cooldownStart = libSqlTimestamp(new Date(now.getTime() - TOKEN_COOLDOWN_MS));

  const results = await executeAtomicLibSqlBatch([
    {
      sql: `INSERT INTO "AccountActionToken"
              ("id", "userId", "purpose", "tokenHash", "expiresAt", "consumedAt", "createdAt")
            SELECT ?, ?, ?, ?, ?, NULL, ?
            WHERE NOT EXISTS (
              SELECT 1
              FROM "AccountActionToken"
              WHERE "userId" = ?
                AND "purpose" = ?
                AND "createdAt" > ?
            )`,
      values: [
        randomUUID(),
        input.userId,
        input.purpose,
        tokenHash,
        expiry,
        createdAt,
        input.userId,
        input.purpose,
        cooldownStart,
      ],
    },
    {
      sql: `UPDATE "AccountActionToken"
            SET "consumedAt" = ?
            WHERE "userId" = ?
              AND "purpose" = ?
              AND "tokenHash" <> ?
              AND "consumedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM "AccountActionToken" WHERE "tokenHash" = ?
              )`,
      values: [createdAt, input.userId, input.purpose, tokenHash, tokenHash],
    },
  ]);

  if (results[0]?.changes !== 1) return undefined;
  return { rawToken, expiresAt };
}

function tokenIsActiveSql() {
  return `"tokenHash" = ?
    AND "purpose" = ?
    AND "consumedAt" IS NULL
    AND "expiresAt" > ?`;
}

export async function consumeVerificationToken(rawToken: string, now = new Date()) {
  const tokenHash = hashAccountActionToken(rawToken);
  const timestamp = libSqlTimestamp(now);
  const activeToken = tokenIsActiveSql();
  const results = await executeAtomicLibSqlBatch([
    {
      sql: `UPDATE "User"
            SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", ?),
                "updatedAt" = ?
            WHERE "id" = (
              SELECT "userId"
              FROM "AccountActionToken"
              WHERE ${activeToken}
            )`,
      values: [timestamp, timestamp, tokenHash, "VERIFY_EMAIL", timestamp],
    },
    {
      sql: `UPDATE "AccountActionToken"
            SET "consumedAt" = ?
            WHERE ${activeToken}`,
      values: [timestamp, tokenHash, "VERIFY_EMAIL", timestamp],
    },
  ]);

  if (results[0]?.changes !== 1 || results[1]?.changes !== 1) {
    throw new AccountActionTokenInvalidError();
  }
}

export async function consumePasswordResetToken(input: {
  rawToken: string;
  passwordHash: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const tokenHash = hashAccountActionToken(input.rawToken);
  const timestamp = libSqlTimestamp(now);
  const activeToken = tokenIsActiveSql();
  const results = await executeAtomicLibSqlBatch([
    {
      sql: `UPDATE "User"
            SET "password" = ?, "updatedAt" = ?
            WHERE "id" = (
              SELECT "userId"
              FROM "AccountActionToken"
              WHERE ${activeToken}
            )`,
      values: [input.passwordHash, timestamp, tokenHash, "PASSWORD_RESET", timestamp],
    },
    {
      sql: `UPDATE "AccountActionToken"
            SET "consumedAt" = ?
            WHERE ${activeToken}`,
      values: [timestamp, tokenHash, "PASSWORD_RESET", timestamp],
    },
  ]);

  if (results[0]?.changes !== 1 || results[1]?.changes !== 1) {
    throw new AccountActionTokenInvalidError();
  }
}
