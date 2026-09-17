import { describe, expect, it, vi } from "vitest";

/**
 * Regression for the 2026-09-17 production build failure.
 *
 * `secret` used to be resolved at module load, so importing the auth config
 * threw whenever no secret was present. Next imports every route to collect
 * configuration during a build, and on Vercel the secret is a Sensitive
 * environment variable that is deliberately absent at build time, so the
 * production build failed with "Failed to collect configuration for
 * /api/attempt" instead of the request failing.
 *
 * Importing must stay side-effect free, while reading `secret` must still fail
 * closed on a hosted runtime with no secret configured.
 */

const mocks = vi.hoisted(() => ({
  options: undefined as { secret?: unknown } | undefined,
  requireAuthSecret: vi.fn(),
}));

vi.mock("@/lib/auth-secret", () => ({
  requireAuthSecret: mocks.requireAuthSecret,
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("bcryptjs", () => ({ compare: vi.fn() }));
vi.mock("next-auth/providers/credentials", () => ({
  default: (provider: unknown) => provider,
}));
vi.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return {
    default: (options: { secret?: unknown }) => {
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

describe("auth secret resolution timing", () => {
  it("does not resolve the secret while the module is being imported", async () => {
    mocks.requireAuthSecret.mockImplementation(() => {
      throw new Error("secret resolved too early");
    });

    // The import itself must not throw, which is what a build depends on.
    await expect(import("./config")).resolves.toBeDefined();
    expect(mocks.requireAuthSecret).not.toHaveBeenCalled();
  });

  it("resolves the secret when Auth.js reads it, and propagates a missing one", async () => {
    await import("./config");
    const options = mocks.options;
    expect(options).toBeDefined();

    mocks.requireAuthSecret.mockReturnValue("a-configured-secret");
    expect(options!.secret).toBe("a-configured-secret");
    expect(mocks.requireAuthSecret).toHaveBeenCalled();

    // Fail-closed is unchanged: a hosted runtime without a secret still throws,
    // now at the point a session would be issued rather than at import.
    mocks.requireAuthSecret.mockImplementation(() => {
      throw new Error("Authentication secret is missing for this hosted runtime.");
    });
    expect(() => options!.secret).toThrow(/Authentication secret is missing/);
  });
});
