import { describe, expect, it } from "vitest";
import {
  DatabaseUnavailableError,
  normalizeDatabaseOperationError,
} from "./database-errors";

describe("normalizeDatabaseOperationError", () => {
  it.each([
    new TypeError("fetch failed"),
    Object.assign(new Error("connector timed out"), { code: "P1002" }),
    Object.assign(new Error("connect failed"), { cause: { code: "ECONNREFUSED" } }),
    new Error("SERVER_ERROR: Server returned HTTP status 401: unauthorized"),
  ])("maps known connector failures without preserving their details", (error) => {
    const normalized = normalizeDatabaseOperationError(error);

    expect(normalized).toBeInstanceOf(DatabaseUnavailableError);
    expect((normalized as Error).message).toBe("Database is temporarily unavailable.");
    expect(normalized).not.toHaveProperty("cause");
  });

  it.each([
    Object.assign(new Error("unique"), { code: "P2002" }),
    Object.assign(new Error("constraint"), { code: "SQLITE_CONSTRAINT" }),
    new Error("application invariant failed"),
  ])("does not mask non-operational errors", (error) => {
    expect(normalizeDatabaseOperationError(error)).toBe(error);
  });
});
