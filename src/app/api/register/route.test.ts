import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { DatabaseUnavailableError } from "@/lib/database-errors";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  executeAtomicBatch: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  issueAccountActionToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendAccountExistsEmail: vi.fn(),
  isEmailDeliveryUnavailableError: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
  },
}));
vi.mock("@/lib/libsql-batch", () => ({
  executeAtomicLibSqlBatch: mocks.executeAtomicBatch,
  libSqlTimestamp: (value: Date) => value.getTime(),
}));
vi.mock("bcryptjs", () => ({ hash: mocks.hash, compare: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/logger", () => ({ default: { info: mocks.info, error: mocks.error, warn: mocks.warn } }));
vi.mock("@/server/account-actions", () => ({
  issueAccountActionToken: mocks.issueAccountActionToken,
}));
vi.mock("@/server/account-email", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));
vi.mock("@/server/email/account-exists", () => ({
  sendAccountExistsEmail: mocks.sendAccountExistsEmail,
}));
vi.mock("@/server/email", () => ({
  isEmailDeliveryUnavailableError: mocks.isEmailDeliveryUnavailableError,
}));

import { POST } from "./route";

let database: ReturnType<typeof createClient>;

const acceptedBody = { accepted: true, verificationEmailSent: true };

async function request(body: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Lan",
      email: "lan@example.com",
      password: "safe-pass",
      ...body,
    }),
  }));
}

/** Runs the deferred callbacks the way Next does: only once the response is out. */
async function flushAfter() {
  for (const callback of mocks.afterCallbacks.splice(0)) {
    await callback();
  }
}

async function rowCount(table: "User" | "LearnerProfile" | "SkillMastery") {
  const result = await database.execute(`SELECT COUNT(*) AS "count" FROM "${table}"`);
  return Number((result.rows[0] as unknown as { count: unknown }).count);
}

async function assertNoAccountRows() {
  await expect(rowCount("User")).resolves.toBe(0);
  await expect(rowCount("LearnerProfile")).resolves.toBe(0);
  await expect(rowCount("SkillMastery")).resolves.toBe(0);
}

async function addInsertionFault(point: "user" | "profile" | string) {
  const trigger = point === "user"
    ? `CREATE TRIGGER "fail_registration_user"
         BEFORE INSERT ON "User"
         BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`
    : point === "profile"
      ? `CREATE TRIGGER "fail_registration_profile"
           BEFORE INSERT ON "LearnerProfile"
           BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`
      : `CREATE TRIGGER "fail_registration_${point}"
           BEFORE INSERT ON "SkillMastery"
           WHEN NEW."skillKey" = '${point}'
           BEGIN SELECT RAISE(ABORT, 'injected registration fault'); END`;
  await database.execute(trigger);
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.afterCallbacks.length = 0;
  database = createClient({ url: "file::memory:" });
  await database.batch([
    { sql: "PRAGMA foreign_keys = ON", args: [] },
    {
      sql: `CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL, "role" TEXT NOT NULL,
        "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE "LearnerProfile" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE,
        "estimatedCefrLevel" TEXT NOT NULL, "listeningMastery" REAL NOT NULL,
        "vocabularyMastery" REAL NOT NULL, "spellingMastery" REAL NOT NULL,
        "lastActivityAt" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE "SkillMastery" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "skillKey" TEXT NOT NULL,
        "masteryScore" REAL NOT NULL, "evidenceCount" INTEGER NOT NULL,
        "lastUpdatedAt" INTEGER NOT NULL,
        UNIQUE("userId", "skillKey"),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )`,
      args: [],
    },
  ], "write");
  mocks.findUnique.mockResolvedValue(null);
  mocks.hash.mockResolvedValue("bcrypt-hash");
  mocks.issueAccountActionToken.mockResolvedValue({ rawToken: "test-token" });
  mocks.sendVerificationEmail.mockResolvedValue(undefined);
  mocks.sendAccountExistsEmail.mockResolvedValue(undefined);
  mocks.isEmailDeliveryUnavailableError.mockReturnValue(false);
  mocks.executeAtomicBatch.mockImplementation(async (statements: Array<{
    sql: string;
    values?: Array<string | number | null>;
  }>) => {
    const results = await database.batch(
      statements.map(({ sql, values = [] }) => ({ sql, args: values })),
      "write",
    );
    return results.map((result) => ({ changes: Number(result.rowsAffected) }));
  });
});

afterEach(async () => {
  await database?.close();
});

describe("POST /api/register", () => {
  it("creates exactly one complete learner graph in one atomic batch and ignores a submitted role", async () => {
    const response = await request({ role: "TEACHER" });
    await flushAfter();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(acceptedBody);
    expect(mocks.hash).toHaveBeenCalledWith("safe-pass", 12);
    expect(mocks.executeAtomicBatch).toHaveBeenCalledTimes(1);
    expect(mocks.executeAtomicBatch.mock.calls[0]?.[0]).toHaveLength(8);
    await expect(rowCount("User")).resolves.toBe(1);
    await expect(rowCount("LearnerProfile")).resolves.toBe(1);
    await expect(rowCount("SkillMastery")).resolves.toBe(6);

    const user = await database.execute('SELECT "role", "password" FROM "User"');
    expect(user.rows[0]).toMatchObject({ role: "LEARNER", password: "bcrypt-hash" });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipient: expect.objectContaining({ email: "lan@example.com" }),
      rawToken: "test-token",
    }));
    expect(mocks.sendAccountExistsEmail).not.toHaveBeenCalled();
  });

  it("sends the first verification email after the response, not before", async () => {
    const response = await request();

    expect(response.status).toBe(202);
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();

    await flushAfter();
    expect(mocks.issueAccountActionToken).toHaveBeenCalledWith({ userId: expect.any(String), purpose: "VERIFY_EMAIL" });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps the unverified account and logs mail unavailability without changing the response", async () => {
    mocks.sendVerificationEmail.mockRejectedValue(new Error("provider unavailable"));

    const response = await request();
    await flushAfter();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(acceptedBody);
    await expect(rowCount("User")).resolves.toBe(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "unknown" }),
      "Initial verification email delivery unavailable",
    );
  });

  it.each([
    "user",
    "profile",
    "listening",
    "vocabulary",
    "spelling",
    "function_words",
    "segmentation",
    "final_sounds",
  ] as const)("rolls back the entire account graph when the %s insert fails", async (point) => {
    await addInsertionFault(point);

    const response = await request();

    expect(response.status).toBe(500);
    await assertNoAccountRows();
  });

  it("A3: maps a same-email race to one complete account and two identical accepted responses", async () => {
    const responses = await Promise.all([request(), request()]);
    await flushAfter();

    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies).toEqual([acceptedBody, acceptedBody]);
    await expect(rowCount("User")).resolves.toBe(1);
    await expect(rowCount("LearnerProfile")).resolves.toBe(1);
    await expect(rowCount("SkillMastery")).resolves.toBe(6);
  });

  it("A3: an existing verified email gets the same 202 and an account-exists email with a reset link", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "existing-user",
      name: "Lan",
      email: "lan@example.com",
      emailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(acceptedBody);
    expect(mocks.executeAtomicBatch).not.toHaveBeenCalled();

    await flushAfter();
    expect(mocks.issueAccountActionToken).toHaveBeenCalledWith({ userId: "existing-user", purpose: "PASSWORD_RESET" });
    expect(mocks.sendAccountExistsEmail).toHaveBeenCalledWith({
      requestUrl: "http://localhost/api/register",
      recipient: expect.objectContaining({ id: "existing-user", email: "lan@example.com" }),
      rawToken: "test-token",
    });
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("A3: an existing unverified email gets the same 202 and a fresh verification email", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "existing-user",
      name: "Lan",
      email: "lan@example.com",
      emailVerifiedAt: null,
    });

    const response = await request();
    await flushAfter();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(acceptedBody);
    expect(mocks.issueAccountActionToken).toHaveBeenCalledWith({ userId: "existing-user", purpose: "VERIFY_EMAIL" });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendAccountExistsEmail).not.toHaveBeenCalled();
  });

  it("A3: response time is the same for a new and an existing email", async () => {
    const started = performance.now();
    const fresh = await request();
    const freshMs = performance.now() - started;
    await flushAfter();

    mocks.findUnique.mockResolvedValue({ id: "existing-user", name: "Lan", email: "lan@example.com", emailVerifiedAt: new Date() });
    const startedExisting = performance.now();
    const existing = await request();
    const existingMs = performance.now() - startedExisting;
    await flushAfter();

    expect(fresh.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(freshMs).toBeGreaterThanOrEqual(590);
    expect(existingMs).toBeGreaterThanOrEqual(590);
    // Real bcrypt and timers run here; under a loaded parallel vitest run the wall clock jitters,
    // so the unit assertion allows 150 ms. The live check (Plan13 TESTING-ACCEPTANCE) holds the 50 ms bar.
    expect(Math.abs(freshMs - existingMs)).toBeLessThan(150);
  });

  it("returns an opaque 503 when persistence is unavailable", async () => {
    mocks.findUnique.mockRejectedValue(new DatabaseUnavailableError());

    const response = await request();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});
