import { isHostedVercelRuntime } from "@/lib/migration-write-gate";

export type AuthSecretEnvironment = Readonly<Record<string, string | undefined>>;

function nonBlank(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Keep Auth.js and the request Proxy on exactly one secret-precedence rule.
 * Preserve non-empty values verbatim: whitespace can be part of a configured
 * secret, while an all-whitespace value is configuration, not a secret.
 */
export function resolveAuthSecret(
  env: AuthSecretEnvironment = process.env,
): string | undefined {
  return nonBlank(env.AUTH_SECRET) ?? nonBlank(env.NEXTAUTH_SECRET);
}

export class AuthSecretConfigurationError extends Error {
  constructor() {
    super("Authentication secret is missing for this hosted runtime.");
    this.name = "AuthSecretConfigurationError";
  }
}

/**
 * Local development keeps Auth.js' existing configuration behavior. Hosted
 * Vercel requests must never fall back to an implicit or mismatched secret.
 */
export function requireAuthSecret(
  env: AuthSecretEnvironment = process.env,
): string | undefined {
  const secret = resolveAuthSecret(env);
  if (!secret && isHostedVercelRuntime(env)) {
    throw new AuthSecretConfigurationError();
  }
  return secret;
}
