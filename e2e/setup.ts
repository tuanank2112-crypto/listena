import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";
import path from "node:path";
import { tmpdir } from "node:os";
import { closeSync, openSync } from "node:fs";

export default async function setup() {
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

  // Plan20: the test process and the app server write this one file at the same
  // time. In the default rollback journal a write locks the whole database, so
  // the loser gets SQLITE_BUSY, which the repository reports as
  // DatabaseUnavailableError — the long-standing `timeline.spec.ts` failure.
  // WAL lets a reader and a writer work at once and is stored in the file, so
  // both processes pick it up. It is set only here, on the isolated temp
  // database this setup already refuses to run outside.
  const database = createClient({ url: process.env.DATABASE_URL! });
  try {
    const mode = await database.execute("PRAGMA journal_mode=WAL");
    const applied = mode.rows[0]?.journal_mode;
    if (String(applied).toLowerCase() !== "wal") {
      throw new Error(`Expected the E2E database in WAL mode, got ${String(applied)}`);
    }
  } finally {
    database.close();
  }
}
