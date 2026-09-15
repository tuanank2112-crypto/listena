import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  issueAccountActionToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  isEmailDeliveryUnavailableError: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
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
vi.mock("@/lib/logger", () => ({
  default: { warn: mocks.warn, error: mocks.error },
}));

import { POST } from "./route";

const email = "learner@example.com";

function request(body: unknown = { email }) {
  return new Request("http://localhost/api/account/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/password-reset/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.issueAccountActionToken.mockResolvedValue({ rawToken: "reset-token" });
    mocks.isEmailDeliveryUnavailableError.mockReturnValue(false);
  });

  it("does not reveal whether a valid email belongs to an account", async () => {
    const absent = await POST(request());

    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    const existing = await POST(request());

    expect(absent.status).toBe(202);
    expect(existing.status).toBe(202);
    await expect(absent.json()).resolves.toEqual({ accepted: true });
    await expect(existing.json()).resolves.toEqual({ accepted: true });
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

  it("stays generic when a known account's reset email cannot be delivered", async () => {
    mocks.findUnique.mockResolvedValue({ id: "learner-1", name: "Lan", email });
    mocks.sendPasswordResetEmail.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      { userId: "learner-1", reason: "unknown" },
      "Password-reset email delivery unavailable",
    );
  });
});
