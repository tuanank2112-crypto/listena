import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// This test process and its workers share a fresh DB; never seed the user's dev.db.
process.env.LISTENAI_E2E_DIR ??= mkdtempSync(path.join(tmpdir(), "listena-e2e-"));
process.env.DATABASE_URL = `file:${path.join(process.env.LISTENAI_E2E_DIR, "test.db").replaceAll("\\", "/")}`;
process.env.AI_PROVIDER = "mock";
process.env.NEXTAUTH_SECRET = "listena-isolated-e2e-secret";
process.env.AUTH_URL = "http://127.0.0.1:3100";
process.env.NEXTAUTH_URL = process.env.AUTH_URL;
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
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
