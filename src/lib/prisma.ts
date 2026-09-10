import { createHash } from "node:crypto";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { createClient, type Client } from "@libsql/client";
import {
  resolveDatabaseConfig,
  type DatabaseConfig,
  type DatabaseRuntime,
} from "@/lib/database-config";
import {
  DatabaseConfigurationError,
  normalizeDatabaseOperationError,
} from "@/lib/database-errors";

export {
  DATABASE_CONFIGURATION_MISSING,
  DatabaseConfigurationError,
  type DatabaseConfig,
  type DatabaseRuntime,
} from "@/lib/database-config";

type CachedClient<T> = {
  key: string;
  client: T;
};

const globalForDatabase = globalThis as unknown as {
  prisma?: CachedClient<PrismaClient>;
  atomicLibSql?: CachedClient<Client>;
};

function cacheKey(config: DatabaseConfig) {
  // Never retain the opaque Turso token in a global key. A fingerprint still
  // makes an in-process credential rotation select a fresh client.
  const tokenFingerprint = config.runtime === "turso"
    ? createHash("sha256").update(config.authToken).digest("hex")
    : "";
  return `${config.runtime}:${config.url}:${tokenFingerprint}`;
}

function createLibSqlClient(config: DatabaseConfig) {
  try {
    return config.runtime === "turso"
      ? createClient({ url: config.url, authToken: config.authToken })
      : createClient({ url: config.url });
  } catch {
    // Client construction is configuration parsing, not an operational query.
    // Preserve the fail-closed, credential-free contract for route handlers.
    throw new DatabaseConfigurationError();
  }
}

function createPrismaClient(config: DatabaseConfig) {
  try {
    const adapterConfig =
      config.runtime === "turso"
        ? { url: config.url, authToken: config.authToken }
        : { url: config.url };

    const client = new PrismaClient({
      adapter: new PrismaLibSQL(adapterConfig, { timestampFormat: config.timestampFormat }),
    });
    return client.$extends({
      name: "database-operational-errors",
      query: {
        $allOperations: async ({ args, query }) => {
          try {
            return await query(args);
          } catch (error) {
            throw normalizeDatabaseOperationError(error);
          }
        },
      },
    }) as unknown as PrismaClient;
  } catch {
    throw new DatabaseConfigurationError();
  }
}

export function getDatabaseRuntime(): DatabaseRuntime {
  return resolveDatabaseConfig().runtime;
}

/**
 * Direct libSQL access is deliberately limited to the small set of guarded,
 * multi-record commits. It uses the same explicit local/Turso configuration as
 * Prisma and is cached for warm Node instances.
 */
export function getAtomicLibSqlClient(): Client {
  const config = resolveDatabaseConfig();
  const key = cacheKey(config);
  const cached = globalForDatabase.atomicLibSql;
  if (cached?.key === key) return cached.client;

  const client = createLibSqlClient(config);
  globalForDatabase.atomicLibSql = { key, client };
  return client;
}

/**
 * Raw SQL batch writes must use the timestamp representation of the active
 * driver. Local Prisma/libSQL files use integer milliseconds; Turso retains
 * the ISO timestamp representation imported from D1.
 */
export function toLibSqlTimestamp(value: Date): number | string {
  const config = resolveDatabaseConfig();
  return config.runtime === "turso" ? value.toISOString().replace("Z", "+00:00") : value.getTime();
}

function resolvePrismaClient(): PrismaClient {
  const config = resolveDatabaseConfig();
  const key = cacheKey(config);
  const cached = globalForDatabase.prisma;
  if (cached?.key === key) return cached.client;

  const client = createPrismaClient(config);
  globalForDatabase.prisma = { key, client };
  return client;
}

/**
 * Preserve the existing repository call shape while resolving a cached Node
 * Prisma client at method access time. This module contains no Worker/D1 or
 * WASM imports, so Vercel's request path remains Node/libSQL only.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolvePrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
