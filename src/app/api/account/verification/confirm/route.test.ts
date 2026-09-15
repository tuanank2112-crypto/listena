import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeVerificationToken: vi.fn(),
  isAccountActionTokenInvalidError: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/account-actions", () => ({
  consumeVerificationToken: mocks.consumeVerificationToken,
  isAccountActionTokenInvalidError: mocks.isAccountActionTokenInvalidError,
}));
vi.mock("@/lib/logger", () => ({
  default: { error: mocks.error },
}));

import { POST } from "./route";

const token = "v".repeat(43);

function request(body: unknown = { token }) {
  return new Request("http://localhost/api/account/verification/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/verification/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeVerificationToken.mockResolvedValue(undefined);
    mocks.isAccountActionTokenInvalidError.mockReturnValue(false);
  });

  it("maps an invalid or replayed verification token to the same safe response", async () => {
    const replayedToken = { code: "TOKEN_INVALID" };
    mocks.consumeVerificationToken
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(replayedToken);
    mocks.isAccountActionTokenInvalidError.mockImplementation((error) => error === replayedToken);

    const first = await POST(request());
    const replay = await POST(request());

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ verified: true });
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toEqual({
      error: "Liên kết xác thực không hợp lệ hoặc đã hết hạn.",
      code: "TOKEN_INVALID",
    });
    expect(replay.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.consumeVerificationToken).toHaveBeenNthCalledWith(1, token);
    expect(mocks.consumeVerificationToken).toHaveBeenNthCalledWith(2, token);
  });

  it("does not pass a malformed token to the token service", async () => {
    const response = await POST(request({ token: "short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "TOKEN_INVALID" });
    expect(mocks.consumeVerificationToken).not.toHaveBeenCalled();
  });
});
