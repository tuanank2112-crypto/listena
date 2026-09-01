import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { LearningSessionError } from "@/server/learning/errors";

export function invalidRequest(error: string, details?: unknown) {
  return NextResponse.json(
    { error, code: "INVALID_REQUEST", ...(details ? { details } : {}) },
    { status: 400 },
  );
}

export function learningSessionErrorResponse(error: unknown) {
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
