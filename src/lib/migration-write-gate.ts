/**
 * The migration write gate protects a hosted cutover from accepting writes
 * before its target database is ready. Hosted deployments must opt in to
 * writes explicitly; local development keeps the existing writable default.
 */
export type MigrationWriteMode = "disabled" | "enabled";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const vercelRuntimeVariables = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_REGION",
] as const;

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

/**
 * Treat either the app-level runtime marker or any Vercel system marker as a
 * hosted Vercel execution environment. A local process with none of these
 * markers remains writable by default.
 */
export function isHostedVercelRuntime(
  env: RuntimeEnvironment = process.env
): boolean {
  return (
    env.APP_RUNTIME === "vercel" ||
    vercelRuntimeVariables.some((name) => hasValue(env[name]))
  );
}

/**
 * Only the exact values below are valid. Invalid or absent configuration is
 * safe for local development but fails closed whenever this is a Vercel
 * runtime, so a staged deployment cannot accidentally accept production
 * writes before cutover is complete.
 */
export function resolveMigrationWriteMode(
  env: RuntimeEnvironment = process.env
): MigrationWriteMode {
  if (env.MIGRATION_WRITE_MODE === "enabled") {
    return "enabled";
  }

  if (env.MIGRATION_WRITE_MODE === "disabled") {
    return "disabled";
  }

  return isHostedVercelRuntime(env) ? "disabled" : "enabled";
}
