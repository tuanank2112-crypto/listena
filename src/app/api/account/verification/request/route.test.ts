import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  issueAccountActionToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
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
  sendVerificationEmail: mocks.sendVerificationEmail,
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
  return new Request("http://localhost/api/account/verification/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/verification/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.issueAccountActionToken.mockResolvedValue({ rawToken: "verification-token" });
    mocks.isEmailDeliveryUnavailableError.mockReturnValue(false);
  });

  it("uses the same accepted envelope for absent and existing accounts", async () => {
    const absent = await POST(request());

    mocks.findUnique.mockResolvedValue({
      id: "learner-1",
      name: "Lan",
      email,
      emailVerifiedAt: null,
    });
    const existing = await POST(request());

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

  it("keeps the accepted response generic when mail delivery is unavailable", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "learner-1",
      name: "Lan",
      email,
      emailVerifiedAt: null,
    });
    mocks.sendVerificationEmail.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      { userId: "learner-1", reason: "unknown" },
      "Verification email delivery unavailable",
    );
  });
});
