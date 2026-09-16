# Contracts — mutation identity, schema and shared errors

## HTTP mutation identity

The following request fields are required UUID strings for new clients:

```ts
type SubmitAttemptRequest = ExistingSubmitAttemptFields & { clientAttemptId: string };
type ReviewFlashcardRequest = ExistingReviewFlashcardFields & { clientReviewId: string };
type CreateLessonRequest = ExistingCreateLessonFields & { clientRequestId: string };
type GenerateLessonRequest = ExistingGenerateLessonFields & { clientRequestId: string };
```

Canonical hashes use UTF-8 SHA-256 over a stable-key JSON encoding of normalized, server-accepted fields. They exclude transport headers, timestamps and authenticated `userId`; `userId` remains part of the unique key. Float fields are serialized after schema normalization.

```ts
type IdempotentResult<T> =
  | { replayed: false; value: T }
  | { replayed: true; value: T };

class IdempotencyConflictError extends Error {
  readonly code: "IDEMPOTENCY_CONFLICT";
}

class OutcomePendingError extends Error {
  readonly code: "OUTCOME_PENDING";
  readonly retryAfterSeconds: number;
}
```

Same owner + same client ID + same hash must return the committed resource without new counters, provider calls or rows. Same key + different hash returns 409. A pending lease is never converted to a second intent by the server.

## Additive Prisma contract

P100 owns one reviewed migration. Existing rows remain valid through nullable client IDs/hashes and revision `0`; all new API writes require IDs at validation.

```prisma
enum LessonCreationMode {
  MANUAL
  AI
}

enum LessonCreationRequestStatus {
  PENDING
  COMMITTED
  FAILED
  UNKNOWN
}

model Attempt {
  // existing fields unchanged
  clientAttemptId String?
  requestHash     String?
  @@unique([userId, clientAttemptId])
}

model ReviewLog {
  // existing fields unchanged
  clientReviewId String?
  requestHash    String?
  @@unique([userId, clientReviewId])
}

model VocabularyMastery {
  // existing fields unchanged
  revision Int @default(0)
}

model LessonCreationRequest {
  id              String                      @id @default(uuid())
  userId          String
  clientRequestId String
  requestHash     String
  mode            LessonCreationMode
  status          LessonCreationRequestStatus @default(PENDING)
  lessonId        String?
  errorCode       String?
  leaseExpiresAt  DateTime
  createdAt       DateTime                    @default(now())
  updatedAt       DateTime                    @updatedAt
  user            User                        @relation(fields: [userId], references: [id], onDelete: Cascade)
  lesson          Lesson?                     @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  @@unique([userId, clientRequestId])
  @@index([userId, status, createdAt])
}
```

P100 must add the corresponding `User.lessonCreationRequests` and `Lesson.creationRequests` relations. CẤM change existing IDs, delete old rows, backfill fake client IDs or combine this migration with destructive cleanup.

## Service signatures

```ts
submitAttempt(input: SubmitAttemptParams & { clientAttemptId: string }):
  Promise<IdempotentResult<SubmitAttemptResult>>;

reviewFlashcard(input: ReviewFlashcardParams & { clientReviewId: string }):
  Promise<IdempotentResult<ReviewFlashcardResult>>;

createLessonFromRequest(input: {
  userId: string;
  role: "TEACHER" | "ADMIN";
  clientRequestId: string;
  request: CreateLessonInput;
}): Promise<IdempotentResult<{ lessonId: string }>>;

generateLessonFromRequest(input: {
  userId: string;
  role: "TEACHER" | "ADMIN";
  clientRequestId: string;
  request: GenerateLessonInput;
}): Promise<IdempotentResult<{ lessonId: string }>>;
```

## HTTP response contract

| Outcome | Status/body | Caller behavior |
|---|---|---|
| New commit | existing success status plus `{ replayed: false }` | advance UI once |
| Exact replay | same domain result plus `{ replayed: true }` | render prior result; do not regenerate ID |
| ID/body conflict | `409 { code: "IDEMPOTENCY_CONFLICT" }` | stop automatic retry; generate new ID only after new user action |
| Active/unknown pending | `409` or `425 { code: "OUTCOME_PENDING", retryAfterSeconds }` | retry same ID after delay |
| Invalid/foreign object | field-safe 400 or owner-private 404 | do not reveal correct answer or owner |
| Operational DB fault | opaque `503` through existing database error mapper | retry same ID |
| Internal fault | `500 { code: "INTERNAL_ERROR" }` | no raw `error.message` |

All authenticated mutation responses use `Cache-Control: private, no-store`; public account responses use `no-store`.

## Logging contract

```ts
type SafeLogContext = {
  requestId?: string;
  userId?: string;
  resourceId?: string;
  code?: string;
  status?: number | string;
  latencyMs?: number;
};
```

Logs may include bounded IDs/hashes and typed codes. They must not include submitted answers, feedback bodies, raw email tokens, passwords, authorization headers, provider keys, full database URLs, learner questions or arbitrary `Error` objects. Redaction must cover nested/wildcard variants of `password`, `token`, `apiKey`, `api_key`, `secret`, `authorization`, `cookie`, `set-cookie`, `submittedAnswer`, and `message` where message is user content.

## Error classification

| Class | Persisted state | Mandatory caller action |
|---|---|---|
| Validation/authorization | none | correct input/session; no retry loop |
| Exact replay | existing committed graph only | accept result |
| Conflict | none from conflicting request | stop and surface conflict |
| Pending/unknown | ledger only | reuse ID; never start another provider call blindly |
| Provider failure before domain commit | FAILED/UNKNOWN ledger with safe code | allow explicit retry policy from WP spec |
| Database failure inside atomic batch | zero domain rows from that batch | opaque retry using same ID |

## Acceptance evidence

Migration SQL and Prisma schema hashes are recorded. Tests assert row counts, counters, request hashes and provider invocation counts for new, replay, conflict, concurrent and injected-failure cases. A successful HTTP response without database readback is insufficient.
