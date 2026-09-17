import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  issueAccountActionToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
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
    // Next runs `after()` callbacks once the response has been sent. The mock
    // holds them until `flushAfter()` so the ordering is observable.
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
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
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

function request(body: unknown = { email }) {
  return new Request("http://localhost/api/account/password-reset/request", {
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

describe("POST /api/account/password-reset/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.findUnique.mockResolvedValue(null);
    mocks.compare.mockResolvedValue(false);
    mocks.tokenFindFirst.mockResolvedValue(null);
    mocks.issueAccountActionToken.mockResolvedValue({ rawToken: "reset-token" });
    mocks.isEmailDeliveryUnavailableError.mockReturnValue(false);
    mocks.sendPasswordResetEmail.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, SLOW_MAILER_MS)),
    );
  });

  it("A1: response time does not depend on whether the email belongs to an account", async () => {
    const absent = await timedPost();

    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    const existing = await timedPost();

    expect(absent.response.status).toBe(202);
    expect(existing.response.status).toBe(202);
    // Both responses are padded to the same floor and neither waits for the
    // 300 ms mailer, so the two round trips must be indistinguishable.
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

  it("does not reveal whether a valid email belongs to an account", async () => {
    const absent = await POST(request());
    await flushAfter();

    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    const existing = await POST(request());
    await flushAfter();

    expect(absent.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(absent.headers.get("cache-control")).toBe(existing.headers.get("cache-control"));
    await expect(absent.json()).resolves.toEqual({ accepted: true });
    await expect(existing.json()).resolves.toEqual({ accepted: true });
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
    expect(mocks.issueAccountActionToken).toHaveBeenCalledWith({
      userId: "learner-1",
      purpose: "PASSWORD_RESET",
    });
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      requestUrl: "http://localhost/api/account/password-reset/request",
      recipient: expect.objectContaining({ id: "learner-1", email }),
      rawToken: "reset-token",
    });
  });

  it("runs the token and mail work after the response, never before", async () => {
    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();

    await flushAfter();
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("makes both branches pay the same bcrypt and token-table work", async () => {
    await POST(request());
    await flushAfter();
    expect(mocks.compare).toHaveBeenCalledTimes(1);
    expect(mocks.tokenFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.issueAccountActionToken).not.toHaveBeenCalled();

    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    await POST(request());
    await flushAfter();
    expect(mocks.compare).toHaveBeenCalledTimes(2);
    expect(mocks.issueAccountActionToken).toHaveBeenCalledTimes(1);
  });

  it("stays generic when a known account's reset email cannot be delivered", async () => {
    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    mocks.sendPasswordResetEmail.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "learner-1", reason: "unknown" }),
      "Password-reset email delivery unavailable",
    );
  });

  it("keeps the accepted envelope when the account lookup fails after the response", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database offline"));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(202);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
      "Password-reset request work failed after the response",
    );
  });

  it("rejects a malformed email with 400 before any account work", async () => {
    const response = await POST(request({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});
