import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseUnavailableError } from "./database-errors";

vi.mock("server-only", () => ({}));

describe("Prisma libSQL operational error normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps an actual unreachable Turso adapter query to an opaque typed error", async () => {
    // TCP port 0 cannot accept a remote connection. It avoids an external
    // host while exercising the real Prisma/libSQL adapter path.
    vi.stubEnv("APP_RUNTIME", "vercel");
    vi.stubEnv("TURSO_DATABASE_URL", "https://127.0.0.1:0");
    vi.stubEnv("TURSO_AUTH_TOKEN", "test-token-not-a-secret");

    const { prisma } = await import("./prisma");
    let failure: unknown;
    try {
      await prisma.user.findMany();
    } catch (error) {
      failure = error;
    } finally {
      await prisma.$disconnect();
    }

    expect(failure).toBeInstanceOf(DatabaseUnavailableError);
    expect(failure).toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    expect((failure as Error).message).toBe("Database is temporarily unavailable.");
    expect(failure).not.toHaveProperty("cause");
  });
});
