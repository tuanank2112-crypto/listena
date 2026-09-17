import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  client: undefined as unknown,
  warn: vi.fn(),
}));

// Real `executeAtomicLibSqlBatch` from libsql-batch, pointed at an in-memory
// libSQL database created with the Plan13 migration SQL itself.
vi.mock("@/lib/prisma", () => ({
  getAtomicLibSqlClient: () => mocks.client,
  toLibSqlTimestamp: (value: Date) => value.getTime(),
}));
vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }));

import {
  clearLoginFailures,
  clientIpFromRequest,
  hashLoginSubject,
  isLoginLocked,
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_IP_FAILURE_LIMIT,
  loginSubjects,
  recordLoginFailure,
} from "./login-throttle";

const migrationSql = readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20260917230100_plan13_auth_throttle/migration.sql"),
  "utf8",
);

const T0 = new Date("2026-09-17T10:00:00.000Z");
const MINUTE = 60_000;

let database: Client;

async function rows() {
  const result = await database.execute(
    'SELECT "subjectKind", "failedCount", "windowStartedAt", "lockedUntil" FROM "AuthAttempt" ORDER BY "subjectKind"',
  );
  return result.rows.map((row) => ({
    subjectKind: row.subjectKind as string,
    failedCount: Number(row.failedCount),
    windowStartedAt: Number(row.windowStartedAt),
    lockedUntil: row.lockedUntil === null ? null : Number(row.lockedUntil),
  }));
}

function at(minutes: number) {
  return new Date(T0.getTime() + minutes * MINUTE);
}

const lan = loginSubjects("lan@example.com", new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }));

beforeEach(async () => {
  vi.clearAllMocks();
  database = createClient({ url: "file::memory:" });
  mocks.client = database;
  for (const statement of migrationSql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await database.execute(statement);
  }
});

afterEach(async () => {
  await database.close();
});

describe("login subjects", () => {
  it("hashes the email and the first forwarded hop, and falls back to unknown", () => {
    expect(lan.emailKey).toBe(hashLoginSubject("lan@example.com"));
    expect(lan.ipKey).toBe(hashLoginSubject("203.0.113.7"));
    expect(clientIpFromRequest(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIpFromRequest(new Request("http://x"))).toBe("unknown");
    expect(clientIpFromRequest(undefined)).toBe("unknown");
    expect(lan.emailKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("login throttle (A2)", () => {
  it("locks the email after 5 failures in the window and keeps it locked for 15 minutes", async () => {
    for (let index = 0; index < LOGIN_EMAIL_FAILURE_LIMIT - 1; index += 1) {
      await recordLoginFailure(lan, at(index));
      expect(await isLoginLocked(lan, at(index))).toBe(false);
    }

    await recordLoginFailure(lan, at(4));
    expect(await isLoginLocked(lan, at(4))).toBe(true);
    // A correct password at attempt six still meets the lock.
    expect(await isLoginLocked(lan, at(4 + 14))).toBe(true);
    expect(await isLoginLocked(lan, at(4 + 15) )).toBe(false);

    const stored = await rows();
    expect(stored.find((row) => row.subjectKind === "EMAIL")).toMatchObject({
      failedCount: 5,
      windowStartedAt: T0.getTime(),
      lockedUntil: at(4 + 15).getTime(),
    });
    expect(stored.find((row) => row.subjectKind === "IP")).toMatchObject({ failedCount: 5, lockedUntil: null });
  });

  it("restarts the counter once the 10-minute window has passed", async () => {
    for (let index = 0; index < 4; index += 1) await recordLoginFailure(lan, at(0));
    await recordLoginFailure(lan, at(11));

    const stored = await rows();
    expect(stored.find((row) => row.subjectKind === "EMAIL")).toMatchObject({
      failedCount: 1,
      windowStartedAt: at(11).getTime(),
      lockedUntil: null,
    });
    expect(await isLoginLocked(lan, at(11))).toBe(false);
  });

  it("counts the IP independently and locks it at 20 failures across many emails", async () => {
    const attackerIp = new Request("http://x", { headers: { "x-forwarded-for": "192.0.2.9" } });
    const victims = Array.from({ length: LOGIN_IP_FAILURE_LIMIT }, (_, index) =>
      loginSubjects(`victim-${index}@example.com`, attackerIp));

    for (const [index, subject] of victims.entries()) {
      await recordLoginFailure(subject, at(index / 10));
    }

    // Every email saw a single failure, so none is locked by itself...
    const fresh = loginSubjects("someone-else@example.com", attackerIp);
    const emailOnly = { emailKey: fresh.emailKey, ipKey: hashLoginSubject("unrelated") };
    expect(await isLoginLocked(emailOnly, at(3))).toBe(false);
    // ...but the shared IP is.
    expect(await isLoginLocked(fresh, at(3))).toBe(true);
    expect(await isLoginLocked(fresh, at(2 + 15))).toBe(false);

    const ipRow = (await rows()).find((row) => row.subjectKind === "IP");
    expect(ipRow).toMatchObject({ failedCount: LOGIN_IP_FAILURE_LIMIT });
    expect(ipRow?.lockedUntil).not.toBeNull();
  });

  it("clears only the email counter after a successful login", async () => {
    await recordLoginFailure(lan, at(0));
    await recordLoginFailure(lan, at(0));

    await clearLoginFailures(lan);

    const stored = await rows();
    expect(stored.map((row) => row.subjectKind)).toEqual(["IP"]);
    expect(stored[0]).toMatchObject({ failedCount: 2 });
  });

  it("fails open with a warning when the database is unavailable", async () => {
    await database.close();
    const broken = createClient({ url: "file::memory:" });
    // No AuthAttempt table: every query throws like an unavailable database.
    mocks.client = broken;

    await expect(isLoginLocked(lan)).resolves.toBe(false);
    await expect(recordLoginFailure(lan)).resolves.toBeUndefined();
    await expect(clearLoginFailures(lan)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledTimes(3);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorName: expect.any(String) }),
      "Login throttle lookup failed; continuing without a lock check",
    );

    database = broken;
  });

  it("uses one batch with two atomic upserts so concurrent failures never lose a count", async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordLoginFailure(lan, at(0))));

    const stored = await rows();
    expect(stored.find((row) => row.subjectKind === "EMAIL")).toMatchObject({ failedCount: 5 });
    expect(stored.find((row) => row.subjectKind === "IP")).toMatchObject({ failedCount: 5 });
    expect(await isLoginLocked(lan, at(0))).toBe(true);
  });
});
