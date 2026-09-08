import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { closeSync, openSync } from "node:fs";

export default function setup() {
  const directory = path.resolve(process.env.LISTENAI_E2E_DIR ?? "");
  if (path.dirname(directory) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith("listena-e2e-") ||
      process.env.DATABASE_URL !== `file:${path.join(directory, "test.db").replaceAll("\\", "/")}`) {
    throw new Error("Refusing to seed a database outside the isolated E2E directory");
  }
  // Prisma's Windows schema engine requires a file before migrate deploy.
  closeSync(openSync(path.join(directory, "test.db"), "a"));
  for (const args of [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    ["node_modules/tsx/dist/cli.mjs", "scripts/import-dataset.ts"],
  ]) {
    execFileSync(process.execPath, args, { stdio: "pipe", env: process.env });
  }
}
