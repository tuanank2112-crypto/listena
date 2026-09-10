import { PrismaClient } from "@prisma/client";
import { PrismaClient as WorkerPrismaClient } from "@prisma/client/wasm.js";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import path from "node:path";

/** Structural type keeps Node builds independent of Worker-only globals. */
export type NativeD1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): unknown;
  };
  batch(statements: unknown[]): Promise<unknown[]>;
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getDatabaseRuntime(): "node-sqlite" | "cloudflare-d1" {
  // `initOpenNextCloudflareForDev` exposes a mock binding to Next dev. Keep
  // development, scripts, and E2E on their isolated SQLite file instead of
  // loading Prisma's Worker WASM runtime in Node.
  if (process.env.NODE_ENV !== "production") return "node-sqlite";

  try {
    return getCloudflareContext().env.DB ? "cloudflare-d1" : "node-sqlite";
  } catch {
    return "node-sqlite";
  }
}

/**
 * Returns the native D1 binding only in the Worker runtime. Prisma's D1
 * adapter deliberately does not expose ACID transactions, so multi-record
 * commits use this binding's atomic `batch()` API at the few boundaries that
 * require all-or-nothing persistence.
 */
export function getNativeD1Database(): NativeD1Database | undefined {
  if (getDatabaseRuntime() !== "cloudflare-d1") return undefined;
  return getCloudflareContext().env.DB as unknown as NativeD1Database;
}

function getNodePrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for local SQLite");

  // Keep the Node-only SQLite driver out of the Worker module graph. Cloudflare
  // always takes the D1 branch below; local dev, scripts, and E2E load libSQL.
  const sqliteUrl = databaseUrl.startsWith("file:./")
    ? `file:${path.join(process.cwd(), "prisma", databaseUrl.slice("file:".length)).replaceAll("\\", "/")}`
    : databaseUrl;
  const requireNode = eval("require") as (specifier: string) => {
    PrismaLibSQL: new (config: { url: string }, options?: { timestampFormat?: "unixepoch-ms" }) => unknown;
  };
  const { PrismaLibSQL } = requireNode("@prisma/adapter-libsql");
  const client = new PrismaClient({
    adapter: new PrismaLibSQL({ url: sqliteUrl }, { timestampFormat: "unixepoch-ms" }) as never,
  });

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * A Worker binding is request-scoped. Resolve it at method access time instead
 * of retaining it on globalThis, while preserving the existing Prisma call
 * shape used by server routes and repositories.
 */
function resolvePrismaClient(): PrismaClient {
  if (getDatabaseRuntime() !== "cloudflare-d1") return getNodePrisma();
  const database = getNativeD1Database();
  if (!database) throw new Error("Cloudflare D1 binding DB is required");
  return new WorkerPrismaClient({ adapter: new PrismaD1(database as never) }) as unknown as PrismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolvePrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
