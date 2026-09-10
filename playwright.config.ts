import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// This test process and its workers share a fresh DB; never seed the user's dev.db.
process.env.LISTENAI_E2E_DIR ??= mkdtempSync(path.join(tmpdir(), "listena-e2e-"));
process.env.DATABASE_URL = `file:${path.join(process.env.LISTENAI_E2E_DIR, "test.db").replaceAll("\\", "/")}`;
// Exercise the production Responses transport with a generated fake key. The
// Playwright web-server command below preloads a process-only upstream stub;
// application runtime never gets an environment-selected mock provider.
process.env.AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = `e2e-not-a-secret-${randomUUID()}`;
process.env.OPENAI_MODEL = "e2e-responses-test-stub";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
process.env.NEXTAUTH_SECRET = "listena-isolated-e2e-secret";
// Wrangler's generated production binding type preserves the deployed URL as
// a literal, while this isolated Node test server must use localhost. Reflect
// avoids weakening the production binding declaration just for Playwright.
Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3100");
Reflect.set(process.env, "NEXTAUTH_URL", "http://127.0.0.1:3100");
process.env.AUTH_TRUST_HOST = "true";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  workers: 1,
  outputDir: "./test-results",
  reporter: [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --require ./e2e/openai-responses-test-stub.cjs ./node_modules/next/dist/bin/next dev --port 3100",
    // Pass the isolated database and auth/provider settings explicitly to the
    // spawned Next process. Next also loads `.env`; inherited values must win
    // so browser auth and direct Prisma assertions address the same fixture.
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL!,
      AI_PROVIDER: process.env.AI_PROVIDER!,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
      OPENAI_MODEL: process.env.OPENAI_MODEL!,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL!,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
      AUTH_URL: "http://127.0.0.1:3100",
      NEXTAUTH_URL: "http://127.0.0.1:3100",
      AUTH_TRUST_HOST: "true",
    },
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
