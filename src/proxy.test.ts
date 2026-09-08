import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { proxy } from "./proxy";

const secret = "isolated-proxy-regression-secret";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", secret);
  vi.stubEnv("NEXTAUTH_URL", undefined);
  vi.stubEnv("AUTH_URL", undefined);
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
