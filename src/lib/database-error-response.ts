import { NextResponse } from "next/server";
import {
  isDatabaseConfigurationError,
  isDatabaseUnavailableError,
} from "@/lib/database-errors";

/**
 * Converts only deliberately opaque database errors to a stable public
 * response. Unknown errors must stay with their route-specific handler.
 */
export function databaseErrorResponse(error: unknown): NextResponse | undefined {
  const code = isDatabaseConfigurationError(error)
    ? "DATABASE_CONFIGURATION_MISSING"
    : isDatabaseUnavailableError(error)
      ? "DATABASE_UNAVAILABLE"
      : undefined;

  if (!code) return undefined;

  return NextResponse.json(
    {
      error: "Dịch vụ dữ liệu tạm thời không khả dụng. Vui lòng thử lại.",
      code,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
