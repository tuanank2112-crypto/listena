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

const logger = pino({
  level: resolveLogLevel(process.env.LOG_LEVEL),
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  redact: {
    paths: ["password", "token", "apiKey", "api_key", "secret", "authorization"],
    censor: "[REDACTED]",
  },
});

export default logger;
