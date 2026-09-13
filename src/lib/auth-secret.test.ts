import { describe, expect, it } from "vitest";
import {
  AuthSecretConfigurationError,
  requireAuthSecret,
  resolveAuthSecret,
} from "./auth-secret";

describe("resolveAuthSecret", () => {
  it.each([
    [{ AUTH_SECRET: "preferred", NEXTAUTH_SECRET: "legacy" }, "preferred"],
    [{ AUTH_SECRET: "  ", NEXTAUTH_SECRET: "legacy" }, "legacy"],
    [{ AUTH_SECRET: undefined, NEXTAUTH_SECRET: "legacy" }, "legacy"],
    [{ AUTH_SECRET: "preferred", NEXTAUTH_SECRET: "  " }, "preferred"],
    [{ AUTH_SECRET: "  ", NEXTAUTH_SECRET: "\t" }, undefined],
  ] as const)("uses the first nonblank supported secret", (env, expected) => {
    expect(resolveAuthSecret(env)).toBe(expected);
  });

  it("rejects a hosted runtime without a nonblank secret before it can authenticate", () => {
    expect(() => requireAuthSecret({
      APP_RUNTIME: "vercel",
      AUTH_SECRET: " ",
      NEXTAUTH_SECRET: "\t",
    })).toThrow(AuthSecretConfigurationError);
  });

  it("allows local development to retain its existing non-hosted configuration behavior", () => {
    expect(requireAuthSecret({ APP_RUNTIME: "local" })).toBeUndefined();
  });
});
