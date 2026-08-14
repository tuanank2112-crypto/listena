import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
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
