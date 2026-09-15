import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  isAccountActionTokenInvalidError: vi.fn(),
  error: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/server/account-actions", () => ({
  consumePasswordResetToken: mocks.consumePasswordResetToken,
  isAccountActionTokenInvalidError: mocks.isAccountActionTokenInvalidError,
}));
vi.mock("@/lib/logger", () => ({
  default: { error: mocks.error },
}));

import { POST } from "./route";

const token = "r".repeat(43);
const password = "new-safe-password";

function request(body: unknown = { token, password }) {
  return new Request("http://localhost/api/account/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/password-reset/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("bcrypt-password-hash");
    mocks.consumePasswordResetToken.mockResolvedValue(undefined);
    mocks.isAccountActionTokenInvalidError.mockReturnValue(false);
  });

  it("hashes the submitted password before passing it with the raw action token", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ passwordReset: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.hash).toHaveBeenCalledWith(password, 12);
    expect(mocks.consumePasswordResetToken).toHaveBeenCalledWith({
      rawToken: token,
      passwordHash: "bcrypt-password-hash",
    });
  });

  it("maps a consumed or expired reset token to a stable invalid-token response", async () => {
    const replayedToken = { code: "TOKEN_INVALID" };
    mocks.consumePasswordResetToken.mockRejectedValue(replayedToken);
    mocks.isAccountActionTokenInvalidError.mockImplementation((error) => error === replayedToken);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      code: "TOKEN_INVALID",
    });
  });
});
