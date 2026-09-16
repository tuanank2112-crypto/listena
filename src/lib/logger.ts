import pino from "pino";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Hosted environment-variable UIs can materialize an unset value as an empty
 * string. Pino rejects that value during module evaluation, which would make
 * every route importing the logger fail at build time. Keep logging
 * non-critical by falling back to the safe default for any malformed value.
 */
export function resolveLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  return normalized && LOG_LEVELS.includes(normalized as LogLevel)
    ? (normalized as LogLevel)
    : "info";
}

export const REDACT_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "token",
  "*.token",
  "*.*.token",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "api_key",
  "*.api_key",
  "*.*.api_key",
  "secret",
  "*.secret",
  "*.*.secret",
  "authorization",
  "*.authorization",
  "*.*.authorization",
  "cookie",
  "*.cookie",
  "*.*.cookie",
  "set-cookie",
  "*.set-cookie",
  "*.*.set-cookie",
  "submittedAnswer",
  "*.submittedAnswer",
  "*.*.submittedAnswer",
  "rawToken",
  "*.rawToken",
  "*.*.rawToken",
  "tokenHash",
  "*.tokenHash",
  "*.*.tokenHash",
];

const logger = pino({
  level: resolveLogLevel(process.env.LOG_LEVEL),
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
});

export default logger;
