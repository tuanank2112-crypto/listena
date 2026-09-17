import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";

type CapturedAuthOptions = {
  providers: Array<{
    authorize: (
      credentials: Record<string, string | undefined> | undefined,
      request?: Request,
    ) => Promise<unknown>;
  }>;
  callbacks: {
    jwt: (params: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    session: (params: {
      session: { user?: Record<string, unknown> | null };
      token: Record<string, unknown>;
    }) => Promise<{ user?: Record<string, unknown> | null }>;
  };
};

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  equalizePasswordWork: vi.fn(),
  findUnique: vi.fn(),
  warn: vi.fn(),
  client: undefined as unknown,
  options: undefined as CapturedAuthOptions | undefined,
}));

vi.mock("@/lib/auth-secret", () => ({
  requireAuthSecret: () => "test-auth-secret",
}));

// The throttle runs for real against an in-memory libSQL database built from
// the Plan13 migration; only the account read and bcrypt are mocked.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
  getAtomicLibSqlClient: () => mocks.client,
  toLibSqlTimestamp: (value: Date) => value.getTime(),
}));

vi.mock("@/lib/logger", () => ({ default: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }));

vi.mock("@/server/auth/opaque-response", () => ({
  equalizePasswordWork: mocks.equalizePasswordWork,
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.compare,
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (provider: unknown) => provider,
}));

vi.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";

    constructor() {
      super("Credentials sign-in failed");
      this.name = "CredentialsSignin";
    }
  }

  return {
    default: (options: CapturedAuthOptions) => {
      mocks.options = options;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
    CredentialsSignin,
  };
});

import { AuthLockedError, EmailNotVerifiedError, ROLE_REFRESH_INTERVAL_MS } from "./config";

const migrationSql = readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20260917230100_plan13_auth_throttle/migration.sql"),
  "utf8",
);

let database: Client;

function getAuthorize() {
  const authorize = mocks.options?.providers[0]?.authorize;
  if (!authorize) throw new Error("Credentials authorize callback was not captured.");
  return authorize;
}

function getCallbacks() {
  const callbacks = mocks.options?.callbacks;
  if (!callbacks) throw new Error("Auth callbacks were not captured.");
  return callbacks;
}

function fromIp(ip: string) {
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

async function attemptRows() {
  const result = await database.execute('SELECT "subjectKind", "failedCount" FROM "AuthAttempt" ORDER BY "subjectKind"');
  return result.rows.map((row) => ({ subjectKind: row.subjectKind, failedCount: Number(row.failedCount) }));
}

const verifiedLearner = {
  id: "user-1",
  name: "Lan",
  email: "lan@example.com",
  password: "stored-password-hash",
  role: "LEARNER",
  emailVerifiedAt: new Date("2026-09-15T00:00:00.000Z"),
};

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.compare.mockReset();
  mocks.findUnique.mockReset();
  database = createClient({ url: "file::memory:" });
  mocks.client = database;
  for (const statement of migrationSql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await database.execute(statement);
  }
});

afterEach(async () => {
  vi.useRealTimers();
  await database.close();
});

describe("Credentials authentication email-verification gate", () => {
  it("normalizes the submitted email before querying and returns a verified user", async () => {
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(true);

    await expect(getAuthorize()({
      email: "  LAN@EXAMPLE.COM  ",
      password: "correct-password",
    })).resolves.toEqual({
      id: "user-1",
      name: "Lan",
      email: "lan@example.com",
      role: "LEARNER",
      isEmailVerified: true,
    });

    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "lan@example.com" },
    }));
    expect(mocks.compare).toHaveBeenCalledWith("correct-password", "stored-password-hash");
  });

  it("returns null for an unknown account after paying the same bcrypt cost as a real one", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getAuthorize()({
      email: "unknown@example.com",
      password: "any-password",
    })).resolves.toBeNull();

    // Never compares against a real hash, but burns an equivalent bcrypt round.
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.equalizePasswordWork).toHaveBeenCalledTimes(1);
  });

  it("does not run the equalizer for a known account, which already pays a real compare", async () => {
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(false);

    await expect(getAuthorize()({ email: "lan@example.com", password: "wrong" })).resolves.toBeNull();

    expect(mocks.compare).toHaveBeenCalledTimes(1);
    expect(mocks.equalizePasswordWork).not.toHaveBeenCalled();
  });

  it("returns null for an incorrect password", async () => {
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(false);

    await expect(getAuthorize()({
      email: "lan@example.com",
      password: "wrong-password",
    })).resolves.toBeNull();
  });

  it("rejects a correct password for an account whose email has not been verified", async () => {
    mocks.findUnique.mockResolvedValue({ ...verifiedLearner, emailVerifiedAt: null });
    mocks.compare.mockResolvedValue(true);

    try {
      await getAuthorize()({
        email: "lan@example.com",
        password: "correct-password",
      });
      throw new Error("Expected an email verification error.");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailNotVerifiedError);
      expect(error).toMatchObject({ code: "email_not_verified" });
    }
  });

  it("carries the verified claim from authorization through JWT and session callbacks", async () => {
    mocks.findUnique.mockResolvedValue({ ...verifiedLearner, role: "TEACHER" });
    mocks.compare.mockResolvedValue(true);

    const user = await getAuthorize()({
      email: "lan@example.com",
      password: "correct-password",
    }) as Record<string, unknown>;
    const callbacks = getCallbacks();
    const token = (await callbacks.jwt({ token: {}, user }))!;
    const session = await callbacks.session({
      session: { user: { name: "Lan", email: "lan@example.com" } },
      token,
    });

    expect(token).toMatchObject({
      id: "user-1",
      role: "TEACHER",
      isEmailVerified: true,
      roleCheckedAt: expect.any(Number),
    });
    expect(session.user).toMatchObject({
      id: "user-1",
      role: "TEACHER",
      isEmailVerified: true,
    });
  });
});

describe("Credentials login throttle (A2)", () => {
  const credentials = { email: "lan@example.com", password: "wrong-password" };

  it("locks the email after five failures: the sixth attempt with the correct password is refused", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-17T10:00:00.000Z"));
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(false);

    for (let index = 0; index < 5; index += 1) {
      await expect(getAuthorize()(credentials, fromIp("203.0.113.5"))).resolves.toBeNull();
    }
    expect(await attemptRows()).toEqual([
      { subjectKind: "EMAIL", failedCount: 5 },
      { subjectKind: "IP", failedCount: 5 },
    ]);

    mocks.compare.mockResolvedValue(true);
    mocks.findUnique.mockClear();
    await expect(getAuthorize()({ ...credentials, password: "correct-password" }, fromIp("203.0.113.5")))
      .rejects.toBeInstanceOf(AuthLockedError);
    await expect(getAuthorize()({ ...credentials, password: "correct-password" }, fromIp("203.0.113.5")))
      .rejects.toMatchObject({ code: "auth_locked" });
    // The lock is decided before the account is read.
    expect(mocks.findUnique).not.toHaveBeenCalled();

    // Fifteen minutes later the lock has expired and the correct password works.
    vi.setSystemTime(new Date("2026-09-17T10:15:00.001Z"));
    await expect(getAuthorize()({ ...credentials, password: "correct-password" }, fromIp("203.0.113.5")))
      .resolves.toMatchObject({ id: "user-1" });
    expect(await attemptRows()).toEqual([{ subjectKind: "IP", failedCount: 5 }]);
  });

  it("locks an unknown email the same way, without revealing that it does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);

    for (let index = 0; index < 5; index += 1) {
      await expect(getAuthorize()({ email: "ghost@example.com", password: "x" }, fromIp("203.0.113.5"))).resolves.toBeNull();
    }

    await expect(getAuthorize()({ email: "ghost@example.com", password: "x" }, fromIp("203.0.113.5")))
      .rejects.toMatchObject({ code: "auth_locked" });
  });

  it("locks by IP independently of the email after twenty failures", async () => {
    mocks.findUnique.mockResolvedValue(null);

    for (let index = 0; index < 20; index += 1) {
      await getAuthorize()({ email: `u${index}@example.com`, password: "x" }, fromIp("198.51.100.77"));
    }

    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(true);
    await expect(getAuthorize()({ email: "lan@example.com", password: "correct-password" }, fromIp("198.51.100.77")))
      .rejects.toMatchObject({ code: "auth_locked" });
    // The same account from another address is unaffected.
    await expect(getAuthorize()({ email: "lan@example.com", password: "correct-password" }, fromIp("198.51.100.78")))
      .resolves.toMatchObject({ id: "user-1" });
  });

  it("clears the email counter on a successful login", async () => {
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(false);
    await getAuthorize()(credentials, fromIp("203.0.113.5"));
    await getAuthorize()(credentials, fromIp("203.0.113.5"));

    mocks.compare.mockResolvedValue(true);
    await expect(getAuthorize()({ ...credentials, password: "correct-password" }, fromIp("203.0.113.5")))
      .resolves.toMatchObject({ id: "user-1" });

    expect(await attemptRows()).toEqual([{ subjectKind: "IP", failedCount: 2 }]);
  });

  it("fails open when the throttle store is unavailable", async () => {
    await database.close();
    database = createClient({ url: "file::memory:" });
    mocks.client = database; // no AuthAttempt table
    mocks.findUnique.mockResolvedValue(verifiedLearner);
    mocks.compare.mockResolvedValue(true);

    await expect(getAuthorize()({ ...credentials, password: "correct-password" }, fromIp("203.0.113.5")))
      .resolves.toMatchObject({ id: "user-1" });
    expect(mocks.warn).toHaveBeenCalled();
  });
});

describe("JWT role refresh (P130 §5)", () => {
  const staleToken = () => ({
    id: "user-1",
    role: "LEARNER",
    isEmailVerified: true,
    roleCheckedAt: Date.now() - ROLE_REFRESH_INTERVAL_MS - 1,
  });

  it("keeps a recently checked token without touching the database", async () => {
    const token = { ...staleToken(), roleCheckedAt: Date.now() - 1_000 };

    await expect(getCallbacks().jwt({ token })).resolves.toBe(token);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("re-reads the role and verification after five minutes", async () => {
    mocks.findUnique.mockResolvedValue({ role: "TEACHER", emailVerifiedAt: new Date() });
    const token = staleToken();

    const refreshed = await getCallbacks().jwt({ token });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { role: true, emailVerifiedAt: true },
    });
    expect(refreshed).toMatchObject({ role: "TEACHER", isEmailVerified: true });
    expect((refreshed as { roleCheckedAt: number }).roleCheckedAt).toBeGreaterThan(Date.now() - 1_000);
  });

  it("returns null for a deleted user so Auth.js clears the session", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getCallbacks().jwt({ token: staleToken() })).resolves.toBeNull();
  });

  it("keeps the existing claims and logs when the database fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database offline"));
    const token = staleToken();

    await expect(getCallbacks().jwt({ token })).resolves.toMatchObject({ role: "LEARNER", id: "user-1" });
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      "Role refresh failed; keeping the existing session claims",
    );
  });
});
