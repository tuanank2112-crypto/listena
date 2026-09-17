import { createHash } from "node:crypto";

export type IdempotentResult<T> =
  | { replayed: false; value: T }
  | { replayed: true; value: T };

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  constructor(message = "Idempotency key conflict: client ID already used with a different request payload") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class OutcomePendingError extends Error {
  readonly code = "OUTCOME_PENDING" as const;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 5, message = "Operation outcome is pending; retry with the same client ID") {
    super(message);
    this.name = "OutcomePendingError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LegacyResultUnavailableError extends Error {
  readonly code = "LEGACY_RESULT_UNAVAILABLE" as const;
  constructor(
    message = "Kết quả lịch sử không có bản lưu snapshot; vui lòng xem lại trong lịch sử học tập."
  ) {
    super(message);
    this.name = "LegacyResultUnavailableError";
  }
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForCanonicalJson);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      sortedObj[key] = normalizeForCanonicalJson(val);
    }
  }
  return sortedObj;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

export function hashCanonicalPayload(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
