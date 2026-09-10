export const DATABASE_CONFIGURATION_MISSING = "DATABASE_CONFIGURATION_MISSING" as const;
export const DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE" as const;

/**
 * Configuration failures intentionally expose no connection details. They are
 * safe to convert into a public 503 response.
 */
export class DatabaseConfigurationError extends Error {
  readonly code = DATABASE_CONFIGURATION_MISSING;

  constructor() {
    super("Database configuration is missing or invalid.");
    this.name = "DatabaseConfigurationError";
  }
}

/**
 * An operational database failure with an opaque public message. Do not keep
 * a driver Error as `cause`: framework log serializers can otherwise expose a
 * connection URL or authentication details.
 */
export class DatabaseUnavailableError extends Error {
  readonly code = DATABASE_UNAVAILABLE;

  constructor() {
    super("Database is temporarily unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseConfigurationError(
  error: unknown,
): error is DatabaseConfigurationError {
  return error instanceof DatabaseConfigurationError
    || (typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === DATABASE_CONFIGURATION_MISSING);
}

export function isDatabaseUnavailableError(
  error: unknown,
): error is DatabaseUnavailableError {
  return error instanceof DatabaseUnavailableError
    || (typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === DATABASE_UNAVAILABLE);
}

const operationalPrismaCodes = new Set([
  "P1000", // authentication / connector initialization
  "P1001", // unreachable database server
  "P1002", // connection timed out
  "P1003", // configured database does not exist
  "P1008", // operation timed out
  "P1009", // database already exists during connector work
  "P1010", // connector access denied
  "P1011", // TLS connection failure
  "P1017", // server closed the connection
]);

const operationalTransportCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isOperationalDatabaseFailure(error: unknown, seen = new Set<unknown>()): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) return false;
  seen.add(error);

  const record = error as {
    cause?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";

  if (operationalPrismaCodes.has(code) || operationalTransportCodes.has(code)) {
    return true;
  }
  if (/^SQLITE_(?:BUSY|IOERR|CANTOPEN|PROTOCOL|READONLY|FULL|NOTADB|AUTH|PERM)/i.test(code)) {
    return true;
  }
  if (
    /(?:fetch failed|network (?:error|request)|connection (?:closed|refused|reset|timed out)|failed to connect|socket hang up|database is locked|server returned HTTP status \d{3})/i.test(
      message,
    )
  ) {
    return true;
  }

  return isOperationalDatabaseFailure(record.cause, seen);
}

/**
 * Prisma/libSQL transport failures can be wrapped several layers deep by the
 * driver. Convert only recognized connector failures; validation, integrity,
 * and application errors retain their original semantics.
 */
export function normalizeDatabaseOperationError(error: unknown): unknown {
  if (isDatabaseConfigurationError(error) || isDatabaseUnavailableError(error)) {
    return error;
  }
  return isOperationalDatabaseFailure(error) ? new DatabaseUnavailableError() : error;
}
