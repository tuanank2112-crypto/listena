import { describe, expect, it } from "vitest";
import {
  isHostedVercelRuntime,
  resolveMigrationWriteMode,
} from "./migration-write-gate";

describe("migration write gate configuration", () => {
  it("keeps local and non-hosted runtimes writable unless explicitly disabled", () => {
    expect(resolveMigrationWriteMode({})).toBe("enabled");
    expect(resolveMigrationWriteMode({ MIGRATION_WRITE_MODE: "invalid" })).toBe(
      "enabled"
    );
    expect(resolveMigrationWriteMode({ MIGRATION_WRITE_MODE: "disabled" })).toBe(
      "disabled"
    );
    expect(resolveMigrationWriteMode({ MIGRATION_WRITE_MODE: "enabled" })).toBe(
      "enabled"
    );
  });

  it.each([
    { APP_RUNTIME: "vercel" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { VERCEL_URL: "listenai.vercel.app" },
  ])("detects an explicit hosted Vercel runtime: %o", (env) => {
    expect(isHostedVercelRuntime(env)).toBe(true);
    expect(resolveMigrationWriteMode(env)).toBe("disabled");
    expect(resolveMigrationWriteMode({ ...env, MIGRATION_WRITE_MODE: "invalid" })).toBe(
      "disabled"
    );
  });

  it("permits hosted writes only with the exact enabled marker", () => {
    expect(
      resolveMigrationWriteMode({
        APP_RUNTIME: "vercel",
        MIGRATION_WRITE_MODE: "enabled",
      })
    ).toBe("enabled");
    expect(
      resolveMigrationWriteMode({
        VERCEL: "1",
        MIGRATION_WRITE_MODE: " enabled ",
      })
    ).toBe("disabled");
  });
});
