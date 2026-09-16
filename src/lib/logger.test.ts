import { describe, expect, it } from "vitest";
import pino from "pino";
import { resolveLogLevel, REDACT_PATHS } from "./logger";

describe("resolveLogLevel", () => {
  it.each([
    [undefined, "info"],
    ["", "info"],
    ["   ", "info"],
    ["unexpected", "info"],
    ["DEBUG", "debug"],
    [" warn ", "warn"],
    ["silent", "silent"],
  ] as const)("normalizes %j to %s", (value, expected) => {
    expect(resolveLogLevel(value)).toBe(expected);
  });
});

describe("logger redaction", () => {
  it("redacts sensitive fields and canaries at top-level and nested paths", () => {
    const logs: string[] = [];
    const stream = {
      write: (msg: string) => {
        logs.push(msg);
        return true;
      },
    };

    const testLogger = pino(
      {
        level: "info",
        redact: {
          paths: REDACT_PATHS,
          censor: "[REDACTED]",
        },
      },
      stream,
    );

    testLogger.info({
      password: "canary_secret_password_123",
      apiKey: "canary_api_key_456",
      api_key: "canary_api_key_underscored_789",
      token: "canary_raw_token_abc",
      tokenHash: "canary_token_hash_def",
      rawToken: "canary_raw_token_ghi",
      submittedAnswer: "canary_user_answer_jkl",
      cookie: "canary_cookie_mno",
      authorization: "Bearer canary_bearer_token",
      nested: {
        password: "canary_nested_password_123",
        apiKey: "canary_nested_api_key_456",
        token: "canary_nested_token_789",
        submittedAnswer: "canary_nested_answer_abc",
      },
      safeField: "safe_value",
    });

    expect(logs.length).toBe(1);
    const serialized = logs[0];

    // Assert that sensitive canaries are completely absent from serialized output
    expect(serialized).not.toContain("canary_secret_password_123");
    expect(serialized).not.toContain("canary_api_key_456");
    expect(serialized).not.toContain("canary_api_key_underscored_789");
    expect(serialized).not.toContain("canary_raw_token_abc");
    expect(serialized).not.toContain("canary_token_hash_def");
    expect(serialized).not.toContain("canary_raw_token_ghi");
    expect(serialized).not.toContain("canary_user_answer_jkl");
    expect(serialized).not.toContain("canary_cookie_mno");
    expect(serialized).not.toContain("canary_bearer_token");
    expect(serialized).not.toContain("canary_nested_password_123");
    expect(serialized).not.toContain("canary_nested_api_key_456");
    expect(serialized).not.toContain("canary_nested_token_789");
    expect(serialized).not.toContain("canary_nested_answer_abc");

    // Assert safe field remains and redaction censor is present
    expect(serialized).toContain("safe_value");
    expect(serialized).toContain("[REDACTED]");
  });
});

