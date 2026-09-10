import { NextResponse } from "next/server";
import { databaseErrorResponse } from "@/lib/database-error-response";
import { isAIProviderError } from "@/server/ai/errors";
import { PersonalizedLearningError } from "@/server/personalized-learning/service";

export function personalizedLearningErrorResponse(error: unknown) {
  const databaseResponse = databaseErrorResponse(error);
  if (databaseResponse) return databaseResponse;

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
  if (error instanceof PersonalizedLearningError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.retryAfterSeconds
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
      },
      {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined,
      },
    );
  }
  return NextResponse.json(
    { error: "Dịch vụ bài học cá nhân đang bận.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
