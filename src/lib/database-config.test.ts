import { describe, expect, it } from "vitest";
import {
  DATABASE_CONFIGURATION_MISSING,
  DatabaseConfigurationError,
  resolveDatabaseConfig,
} from "./database-config";

describe("resolveDatabaseConfig", () => {
  it("uses a normalized local SQLite file outside hosted Vercel", () => {
    const config = resolveDatabaseConfig({
      APP_RUNTIME: "local",
      DATABASE_URL: "file:./dev.db",
    });

    expect(config).toMatchObject({
      runtime: "local-sqlite",
      timestampFormat: "unixepoch-ms",
    });
    expect(config.url.replaceAll("\\", "/")).toMatch(/\/prisma\/dev\.db$/);
  });

  it("uses Turso only when its URL and opaque token are both configured", () => {
    expect(
      resolveDatabaseConfig({
        APP_RUNTIME: "vercel",
        DATABASE_URL: "file:./dev.db",
        TURSO_DATABASE_URL: "libsql://listenai-staging.turso.io",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toEqual({
      runtime: "turso",
      url: "libsql://listenai-staging.turso.io",
      authToken: "test-token",
      timestampFormat: "iso8601",
    });
  });

  it("fails closed for a partial Turso configuration without leaking values", () => {
    let failure: unknown;
    try {
      resolveDatabaseConfig({
        TURSO_DATABASE_URL: "libsql://secret-host.turso.io",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DatabaseConfigurationError);
    expect(failure).toMatchObject({ code: DATABASE_CONFIGURATION_MISSING });
    expect((failure as Error).message).not.toContain("secret-host");
  });

  it("fails closed when a Vercel runtime lacks complete Turso configuration", () => {
    expect(() =>
      resolveDatabaseConfig({
        APP_RUNTIME: "vercel",
        DATABASE_URL: "file:./dev.db",
      }),
    ).toThrow(DatabaseConfigurationError);
  });

  it("rejects a local-file URL masquerading as a Turso endpoint", () => {
    expect(() =>
      resolveDatabaseConfig({
        APP_RUNTIME: "vercel",
        TURSO_DATABASE_URL: "file:./dev.db",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow(DatabaseConfigurationError);
  });

  it("never selects inherited Turso credentials outside explicit Vercel mode", () => {
    expect(() =>
      resolveDatabaseConfig({
        APP_RUNTIME: "local",
        DATABASE_URL: "file:./dev.db",
        TURSO_DATABASE_URL: "libsql://listenai-production.turso.io",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow(DatabaseConfigurationError);
  });

  it("requires APP_RUNTIME=vercel even when a Vercel system marker is exposed", () => {
    expect(() =>
      resolveDatabaseConfig({
        VERCEL_ENV: "preview",
        TURSO_DATABASE_URL: "libsql://listenai-staging.turso.io",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow(DatabaseConfigurationError);
  });

  it("rejects whitespace around APP_RUNTIME so it cannot disagree with the write gate", () => {
    expect(() =>
      resolveDatabaseConfig({
        APP_RUNTIME: " vercel ",
        TURSO_DATABASE_URL: "libsql://listenai-staging.turso.io",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    ).toThrow(DatabaseConfigurationError);
  });

  it("rejects a Turso URL with embedded credentials or query settings", () => {
    for (const url of [
      "libsql://token@listenai-staging.turso.io",
      "libsql://listenai-staging.turso.io?tls=0",
      "https://listenai-staging.turso.io/%ZZ",
    ]) {
      expect(() =>
        resolveDatabaseConfig({
          APP_RUNTIME: "vercel",
          TURSO_DATABASE_URL: url,
          TURSO_AUTH_TOKEN: "test-token",
        }),
      ).toThrow(DatabaseConfigurationError);
    }
  });
});
