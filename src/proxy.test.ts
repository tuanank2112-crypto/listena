import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { encode } from "next-auth/jwt";
import { config, proxy } from "./proxy";

const secret = "isolated-proxy-regression-secret";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", secret);
  vi.stubEnv("NEXTAUTH_URL", undefined);
  vi.stubEnv("AUTH_URL", undefined);
  vi.stubEnv("MIGRATION_WRITE_MODE", undefined);
  vi.stubEnv("APP_RUNTIME", undefined);
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_URL", undefined);
  vi.stubEnv("VERCEL_BRANCH_URL", undefined);
  vi.stubEnv("VERCEL_DEPLOYMENT_ID", undefined);
  vi.stubEnv("VERCEL_REGION", undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function request(url: string, secure: boolean, role = "LEARNER", chunked = false) {
  const name = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const token = await encode({ token: { id: "learner", role }, secret, salt: name });
  const split = Math.floor(token.length / 2);
  const cookie = chunked
    ? `${name}.0=${token.slice(0, split)}; ${name}.1=${token.slice(split)}`
    : `${name}=${token}`;
  return new NextRequest(url, { headers: { cookie } });
}

describe("migration write fence", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "fails closed for hosted %s API writes",
    async (method) => {
      vi.stubEnv("APP_RUNTIME", "vercel");

      const response = await proxy(
        new NextRequest("https://school.example/api/learning-sessions", { method })
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toEqual({
        error: "Writes are temporarily disabled during migration.",
        code: "MIGRATION_WRITE_DISABLED",
      });
    }
  );

  it("keeps registration behind the hosted write fence", async () => {
    vi.stubEnv("VERCEL", "1");

    const response = await proxy(
      new NextRequest("https://school.example/api/register", { method: "POST" })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "MIGRATION_WRITE_DISABLED",
    });
  });

  it("exempts Auth.js API routes so credentials login and session requests continue", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await proxy(
      new NextRequest("https://school.example/api/auth/callback/credentials", {
        method: "POST",
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "passes hosted %s API requests through",
    async (method) => {
      vi.stubEnv("APP_RUNTIME", "vercel");

      const response = await proxy(
        new NextRequest("https://school.example/api/learning-sessions", { method })
      );

      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("keeps local API writes enabled by default", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/api/register", { method: "POST" })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("matches fenced API routes but leaves Auth.js outside the proxy", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/learning-sessions" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/auth/csrf" })).toBe(false);
    expect(config.matcher).toContain(
      "/((?!api|_next/static|_next/image|favicon.ico).*)"
    );
  });
});

describe("authenticated page proxy", () => {
  it.each([false, true])("accepts Auth.js cookies with secure=%s", async (secure) => {
    const response = await proxy(await request(`${secure ? "https" : "http"}://localhost/learner/dashboard`, secure));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses the configured HTTPS origin behind an HTTP proxy and joins chunked cookies", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://school.example");
    const response = await proxy(await request("http://127.0.0.1/learner/dashboard", true, "LEARNER", true));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("gives AUTH_URL the same precedence as Auth.js", async () => {
    vi.stubEnv("NEXTAUTH_URL", "http://localhost");
    vi.stubEnv("AUTH_URL", "https://school.example");
    const response = await proxy(await request("http://localhost/learner/dashboard", true));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects an invalid encrypted token", async () => {
    const response = await proxy(new NextRequest("https://school.example/learner/dashboard", {
      headers: { cookie: "__Secure-authjs.session-token=invalid" },
    }));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it.each([
    ["LEARNER", "/teacher/lessons", "/learner/dashboard"],
    ["TEACHER", "/learner/games", "/teacher/dashboard"],
  ])("redirects %s to an existing dashboard", async (role, source, target) => {
    const response = await proxy(await request(`http://localhost${source}`, false, role));
    expect(new URL(response.headers.get("location")!).pathname).toBe(target);
  });
});
