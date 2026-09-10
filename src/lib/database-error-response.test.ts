import { describe, expect, it } from "vitest";
import {
  DatabaseConfigurationError,
  DatabaseUnavailableError,
} from "./database-errors";
import { databaseErrorResponse } from "./database-error-response";

describe("databaseErrorResponse", () => {
  it.each([
    [new DatabaseConfigurationError(), "DATABASE_CONFIGURATION_MISSING"],
    [new DatabaseUnavailableError(), "DATABASE_UNAVAILABLE"],
  ])("returns a non-secret 503 for %s", async (error, code) => {
    const response = databaseErrorResponse(error);

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({
      error: "Dịch vụ dữ liệu tạm thời không khả dụng. Vui lòng thử lại.",
      code,
    });
  });

  it("leaves unknown errors to their route-specific handler", () => {
    expect(databaseErrorResponse(new Error("unexpected"))).toBeUndefined();
  });
});
