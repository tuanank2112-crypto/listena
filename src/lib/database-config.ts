import path from "node:path";
import { DatabaseConfigurationError } from "@/lib/database-errors";

export { DATABASE_CONFIGURATION_MISSING, DatabaseConfigurationError } from "@/lib/database-errors";

export type DatabaseRuntime = "local-sqlite" | "turso";

export type DatabaseConfig =
  | {
      runtime: "local-sqlite";
      url: string;
      timestampFormat: "unixepoch-ms";
    }
  | {
      runtime: "turso";
      url: string;
      authToken: string;
      timestampFormat: "iso8601";
    };

type DatabaseEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | "APP_RUNTIME"
  | "DATABASE_URL"
  | "TURSO_AUTH_TOKEN"
  | "TURSO_DATABASE_URL"
  | "VERCEL"
  | "VERCEL_ENV"
  | "VERCEL_URL"
  | "VERCEL_BRANCH_URL"
  | "VERCEL_DEPLOYMENT_ID"
  | "VERCEL_REGION"
>>;

const vercelRuntimeVariables = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_REGION",
] as const;

function missingConfiguration(): never {
  throw new DatabaseConfigurationError();
}

function readEnv(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function resolveApplicationRuntime(env: DatabaseEnvironment): "local" | "vercel" {
  // Unlike connection strings, the runtime selector must be exact. Accepting
  // a trimmed value here would disagree with the proxy write gate and could
  // make a whitespace typo select a different safety mode.
  const explicitRuntime = env.APP_RUNTIME;
  if (explicitRuntime !== undefined && explicitRuntime !== "local" && explicitRuntime !== "vercel") {
    missingConfiguration();
  }

  const hasVercelMarker = vercelRuntimeVariables.some((name) => Boolean(readEnv(env[name])));
  // APP_RUNTIME=vercel is required in Vercel Preview and Production. The
  // provider's VERCEL_* values may be hidden, so neither an inherited Turso
  // token nor an observed marker is allowed to guess a deployment mode.
  if (explicitRuntime === "vercel") return "vercel";
  if (hasVercelMarker) missingConfiguration();
  return "local";
}

function normalizeLocalSqliteUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) missingConfiguration();
  if (!databaseUrl.startsWith("file:./") && !databaseUrl.startsWith("file:../")) {
    return databaseUrl;
  }

  const relativePath = databaseUrl.slice("file:".length);
  return `file:${path.resolve(process.cwd(), "prisma", relativePath).replaceAll("\\", "/")}`;
}

function validateTursoUrl(databaseUrl: string) {
  try {
    // WHATWG URL accepts a literal invalid percent sequence in a path, while
    // libSQL rejects it only on the first query. Turso database endpoints are
    // origin URLs, so reject malformed escapes and non-root paths up front.
    if (/%(?![0-9a-f]{2})/i.test(databaseUrl)) missingConfiguration();
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== "libsql:" && parsed.protocol !== "https:")
      || !parsed.hostname
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.pathname !== "" && parsed.pathname !== "/")
    ) {
      missingConfiguration();
    }
  } catch {
    missingConfiguration();
  }
}

/**
 * Selects the only permitted database mode for a process. An explicitly
 * hosted runtime must never fall back to a local SQLite file when Turso is
 * absent or incomplete.
 */
export function resolveDatabaseConfig(env: DatabaseEnvironment = process.env): DatabaseConfig {
  const applicationRuntime = resolveApplicationRuntime(env);
  const tursoUrl = readEnv(env.TURSO_DATABASE_URL);
  const tursoAuthToken = readEnv(env.TURSO_AUTH_TOKEN);

  if (tursoUrl || tursoAuthToken) {
    if (applicationRuntime !== "vercel" || !tursoUrl || !tursoAuthToken) missingConfiguration();
    validateTursoUrl(tursoUrl);
    return {
      runtime: "turso",
      url: tursoUrl,
      authToken: tursoAuthToken,
      timestampFormat: "iso8601",
    };
  }

  if (applicationRuntime === "vercel") missingConfiguration();

  const localDatabaseUrl = readEnv(env.DATABASE_URL);
  if (!localDatabaseUrl) missingConfiguration();
  return {
    runtime: "local-sqlite",
    url: normalizeLocalSqliteUrl(localDatabaseUrl),
    timestampFormat: "unixepoch-ms",
  };
}
