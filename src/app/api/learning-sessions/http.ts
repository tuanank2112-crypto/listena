import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { isAIProviderError } from "@/server/ai/errors";
import { LearningSessionError } from "@/server/learning/errors";

export function invalidRequest(error: string, details?: unknown) {
  return NextResponse.json(
    { error, code: "INVALID_REQUEST", ...(details ? { details } : {}) },
    { status: 400 },
  );
}

export function learningSessionErrorResponse(error: unknown) {
  if (isAIProviderError(error)) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details.retryAfterSeconds
          ? { retryAfterSeconds: error.details.retryAfterSeconds }
          : {}),
      },
      {
        status: error.status,
        headers: error.details.retryAfterSeconds
          ? { "Retry-After": String(error.details.retryAfterSeconds) }
          : undefined,
      },
    );
  }
  if (error instanceof LearningSessionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  logger.error({ error }, "Learning session request failed");
  return NextResponse.json(
    { error: "Learning session service is unavailable", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
