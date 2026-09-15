import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedAuthOptions = {
  providers: Array<{
    authorize: (credentials: Record<string, string | undefined> | undefined) => Promise<unknown>;
  }>;
  callbacks: {
    jwt: (params: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    session: (params: {
      session: { user?: Record<string, unknown> | null };
      token: Record<string, unknown>;
    }) => Promise<{ user?: Record<string, unknown> | null }>;
  };
};

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  findUnique: vi.fn(),
  options: undefined as CapturedAuthOptions | undefined,
}));

vi.mock("@/lib/auth-secret", () => ({
  requireAuthSecret: () => "test-auth-secret",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
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

import { EmailNotVerifiedError } from "./config";

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

const verifiedLearner = {
  id: "user-1",
  name: "Lan",
  email: "lan@example.com",
  password: "stored-password-hash",
  role: "LEARNER",
  emailVerifiedAt: new Date("2026-09-15T00:00:00.000Z"),
};

describe("Credentials authentication email-verification gate", () => {
  beforeEach(() => {
    mocks.compare.mockReset();
    mocks.findUnique.mockReset();
  });

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

  it("returns null for an unknown account without comparing a password", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getAuthorize()({
      email: "unknown@example.com",
      password: "any-password",
    })).resolves.toBeNull();

    expect(mocks.compare).not.toHaveBeenCalled();
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
    const token = await callbacks.jwt({ token: {}, user });
    const session = await callbacks.session({
      session: { user: { name: "Lan", email: "lan@example.com" } },
      token,
    });

    expect(token).toMatchObject({
      id: "user-1",
      role: "TEACHER",
      isEmailVerified: true,
    });
    expect(session.user).toMatchObject({
      id: "user-1",
      role: "TEACHER",
      isEmailVerified: true,
    });
  });
});
