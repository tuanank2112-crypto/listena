import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import logger from "@/lib/logger";
import { AdaptiveGameError, AdaptiveGameRateLimitError } from "./errors";

export function adaptiveGameErrorResponse(error: unknown) {
  const databaseResponse = databaseErrorResponse(error);
  if (databaseResponse) return databaseResponse;

  if (error instanceof AdaptiveGameRateLimitError) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }
  if (error instanceof AdaptiveGameError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }

  logger.error({ error }, "Adaptive game request failed");
  return NextResponse.json(
    { error: "GAME_UNAVAILABLE", message: "Không thể xử lý game lúc này. Hãy thử lại sau." },
    { status: 500 },
  );
}
