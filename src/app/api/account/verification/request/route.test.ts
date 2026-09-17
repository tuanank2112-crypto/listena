import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  issueAccountActionToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
  isEmailDeliveryUnavailableError: vi.fn(),
  compare: vi.fn(),
  tokenFindFirst: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
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
    accountActionToken: { findFirst: mocks.tokenFindFirst },
  },
}));
vi.mock("@/server/account-actions", () => ({
  issueAccountActionToken: mocks.issueAccountActionToken,
}));
vi.mock("@/server/account-email", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));
vi.mock("@/server/email", () => ({
  isEmailDeliveryUnavailableError: mocks.isEmailDeliveryUnavailableError,
}));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/lib/logger", () => ({
  default: { warn: mocks.warn, error: mocks.error },
}));

import { POST } from "./route";

const email = "learner@example.com";
const SLOW_MAILER_MS = 300;
const unverifiedUser = { id: "learner-1", name: "Lan", email, emailVerifiedAt: null };

function request(body: unknown = { email }) {
  return new Request("http://localhost/api/account/verification/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Runs the deferred callbacks the way Next does: only once the response is out. */
async function flushAfter() {
  for (const callback of mocks.afterCallbacks.splice(0)) {
    await callback();
  }
}

async function timedPost() {
  const startedAt = performance.now();
  const response = await POST(request());
  return { response, elapsedMs: performance.now() - startedAt };
}

describe("POST /api/account/verification/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.findUnique.mockResolvedValue(null);
    mocks.compare.mockResolvedValue(false);
    mocks.tokenFindFirst.mockResolvedValue(null);
    mocks.issueAccountActionToken.mockResolvedValue({ rawToken: "verification-token" });
    mocks.isEmailDeliveryUnavailableError.mockReturnValue(false);
    mocks.sendVerificationEmail.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, SLOW_MAILER_MS)),
    );
  });

  it("A1: response time does not depend on whether the email belongs to an account", async () => {
    const absent = await timedPost();

    mocks.findUnique.mockResolvedValue(unverifiedUser);
    const existing = await timedPost();

    expect(absent.response.status).toBe(202);
    expect(existing.response.status).toBe(202);
    expect(absent.elapsedMs).toBeGreaterThanOrEqual(590);
    expect(existing.elapsedMs).toBeGreaterThanOrEqual(590);
    expect(Math.abs(existing.elapsedMs - absent.elapsedMs)).toBeLessThan(150) // 150 ms: unit run jitters under load; live check holds 50 ms;

    // The 202 exists before any deferred work has started: the callbacks are
    // registered but nothing has touched the database or the mailer.
    expect(mocks.afterCallbacks).toHaveLength(2);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();

    await flushAfter();
  });

  it("uses the same accepted envelope for absent and existing accounts", async () => {
    const absent = await POST(request());
    await flushAfter();

    mocks.findUnique.mockResolvedValue(unverifiedUser);
    const existing = await POST(request());
    await flushAfter();

    expect(absent.status).toBe(202);
    expect(existing.status).toBe(202);
    await expect(absent.json()).resolves.toEqual({ accepted: true });
    await expect(existing.json()).resolves.toEqual({ accepted: true });
    expect(absent.headers.get("Cache-Control")).toBe("no-store");
    expect(existing.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      requestUrl: "http://localhost/api/account/verification/request",
      recipient: expect.objectContaining({ id: "learner-1", email }),
      rawToken: "verification-token",
    });
  });

  it("runs the token and mail work after the response, never before", async () => {
    mocks.findUnique.mockResolvedValue(unverifiedUser);

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();

    await flushAfter();
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("equalizes CPU work for an unknown or already-verified email and sends nothing", async () => {
    await POST(request());
    await flushAfter();
    expect(mocks.compare).toHaveBeenCalledTimes(1);

    mocks.findUnique.mockResolvedValue({ ...unverifiedUser, emailVerifiedAt: new Date() });
    await POST(request());
    await flushAfter();
    expect(mocks.compare).toHaveBeenCalledTimes(2);
    expect(mocks.tokenFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();

    mocks.findUnique.mockResolvedValue(unverifiedUser);
    await POST(request());
    await flushAfter();
    expect(mocks.compare).toHaveBeenCalledTimes(3);
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
  });

  it("keeps the accepted response generic when mail delivery is unavailable", async () => {
    mocks.findUnique.mockResolvedValue(unverifiedUser);
    mocks.sendVerificationEmail.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "learner-1", reason: "unknown" }),
      "Verification email delivery unavailable",
    );
  });

  it("keeps the accepted envelope when the account lookup fails after the response", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database offline"));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(202);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
      "Verification request work failed after the response",
    );
  });

  it("rejects a malformed email with 400 before any account work", async () => {
    const response = await POST(request({ email: "nope" }));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});
