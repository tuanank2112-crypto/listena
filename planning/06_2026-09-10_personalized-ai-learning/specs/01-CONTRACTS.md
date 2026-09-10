# Contracts — data, provider and HTTP

## Primary data contract

The migration introduces these Prisma concepts; all timestamp values are UTC and JSON fields are Zod-validated at their boundary.

```ts
enum CalibrationStatus { UNASSESSED CALIBRATING CALIBRATED }
enum PersonalizedLessonStatus { GENERATING READY FAILED ARCHIVED }
enum AdaptiveGameMode { QUIZ MATCH SPELL }
enum AdaptiveGameRunStatus { ACTIVE COMPLETED EXPIRED }

PersonalizedLesson {
  id, userId, status, targetSkill, cefrLevel, difficulty,
  title, objectivesJson, contentJson, validatorJson,
  sourceSnapshotHash, provider, model, promptVersion,
  failureCode?, createdAt, readyAt?, expiresAt?
}
PersonalizedLessonVocabulary {
  personalizedLessonId, vocabularyItemId, isTarget, importance
}
PersonalizedLessonAttempt {
  id, lessonId, userId, exerciseId, clientAttemptId,
  submittedAnswer, normalizedAnswer?, score, correct?, feedbackVi,
  gradingMethod, responseTimeMs?, createdAt
}
AdaptiveGameRun {
  id, userId, mode, status, targetSkill, difficulty,
  selectionSnapshotHash, startedAt, completedAt?, expiresAt?
}
AdaptiveGameRound {
  id, runId, position, vocabularyItemId, publicJson, validatorJson,
  answeredAt?, score?, clientAnswerId?, responseTimeMs?
}
AdaptiveEvidence {
  id, userId, sourceKind, sourceId, skillKey, vocabularyItemId?,
  score, confidence, difficulty, gradingMethod, responseTimeMs?, hintCount, createdAt
}
```

`LearnerProfile.calibrationStatus` defaults to `UNASSESSED`; its current CEFR/mastery values are a starting prior, not a certified level. Calibration may change CEFR only after the threshold stated in P63; an existing user is never reset.

`PersonalizedLessonVocabulary` connects AI vocabulary to normalized global `VocabularyItem` records while retaining private visibility through its owner-owned parent. AI vocabulary upserts MUST use `update:{}` and never overwrite a shared/core lexical record. Required indexes: `PersonalizedLesson(userId,status,createdAt)`, unique `PersonalizedLesson(userId,targetSkill,sourceSnapshotHash)`, unique `PersonalizedLessonAttempt(lessonId,clientAttemptId)`, `AdaptiveGameRun(userId,status,startedAt)`, `AdaptiveGameRound(runId,position)`, unique `AdaptiveGameRound(runId,clientAnswerId)` where supported or equivalent owner-transaction guard, unique `AdaptiveEvidence(sourceKind,sourceId,skillKey)`, `AdaptiveEvidence(userId,skillKey,createdAt)`, `AdaptiveEvidence(userId,vocabularyItemId,createdAt)`.

## Provider contract

```ts
interface StructuredAIProvider {
  readonly providerName: "openai" | "kira";
  readonly modelName: string;
  generateJson<T>(request: {
    purpose: string;
    systemPrompt: string;
    input: Record<string, unknown>;
    schemaName: string;
    schema: Record<string, unknown>;
    safetyIdentifier?: string;
    maxOutputTokens: number;
  }): Promise<{ output: T; provider: string; model: string; requestId?: string }>;
}
```

Provider configuration and transport are explicit:

- Active KiraAI deployment: `AI_PROVIDER=kira`, `KIRAAI_API_KEY` (hosted secret), `KIRAAI_MODEL=glm-5.3-flash-free`, and `KIRAAI_BASE_URL=https://kiraai.vn/api/v1`. Kira documents `POST /chat/completions` with Bearer authorization. Its adapter MUST request a JSON object, parse `choices[0].message.content`, and validate the result with the server-side Zod schema before any state write. It MUST NOT claim that Kira implements OpenAI Responses `text.format` strict schemas or `store:false`.
- OpenAI alternative: `AI_PROVIDER=openai`, `OPENAI_API_KEY` (hosted secret), `OPENAI_MODEL`, and HTTPS `OPENAI_BASE_URL`. The OpenAI adapter uses `POST /v1/responses`, `text.format` JSON schema with `strict: true`, `store:false`, server timeout, and server-side Zod parsing.

Neither secret is browser-visible or committed. The inactive provider's key is neither read nor sent upstream.

Kira's `baseUrl` contract is exact: the only accepted canonical endpoint base is `https://kiraai.vn/api/v1` (a trailing slash may normalize). HTTP, user-info, query/fragment, a different origin/path, and response redirects are rejected before a credential can leave the Worker.

## Resource and D1 persistence contract

P65 defines the complete contract. The concise runtime invariants are:

```ts
const AI_REQUEST_MIN_INTERVAL_MS = 12_000;
const AI_REQUEST_DAILY_LIMIT = 40;
const AI_REQUEST_PENDING_LEASE_MS = 30_000;

reserveUserAICall({ userId, purpose, requestIdentity? }): Promise<{
  id: string; userId: string; purpose: string;
}>;
settleUserAICall(reservation, outcome): Promise<void>;
```

All live provider paths use `AIInteraction(purpose='ai_call_reservation')` as a non-secret reservation ledger. Worker runtime performs the conditional insert through `env.DB.batch()`; a failed reservation maps to `AI_REQUEST_LIMIT`, HTTP 429 and `Retry-After` with no upstream request. The 12-second cooldown applies to repeat one-off purposes; learning-loop `start_mission` and conversational `evaluate_turn` retain their shared pending lease/daily cap but are not delayed after an accepted reply or next-action CTA.

`executeNativeD1Batch([{ sql, values }])` is the only approved D1 multi-record commit boundary for the learning session, personalized lesson/attempt and adaptive game mutation graphs. Statements MUST be parameter-bound. Each graph must use its documented row-ID/state/claim commit fence; a zero-change fence is conflict/idempotent reconciliation, never success. Callback `prisma.$transaction()` is local Node/SQLite only.

## HTTP contract

```text
POST /api/learner/personalized-lessons
body: { targetSkill?: listening|vocabulary|spelling|grammar|communication }
200/201: { lesson: PublicPersonalizedLesson, reused: boolean }
429: { error: "PERSONALIZATION_LIMIT" | "AI_RATE_LIMITED" /* active generation only */ | "AI_REQUEST_LIMIT", retryAfterSeconds }
503: { error: "AI_UNAVAILABLE" | "AI_RATE_LIMITED" /* upstream provider only */, message }

GET /api/learner/personalized-lessons/:lessonId
200: { lesson: PublicPersonalizedLesson }
404: { error: "PRIVATE_NOT_FOUND" }

POST /api/learner/personalized-lessons/:lessonId/attempts
body: { exerciseId: string, answer: string, clientAttemptId: string, responseTimeMs?: number }
201/200: { attempt: { id, score, correct, feedbackVi, idempotent } }

POST /api/game-runs
body: { mode: QUIZ|MATCH|SPELL }
201: { run: PublicGameRun }

POST /api/game-runs/:runId/answers
body: { roundId: string, answer: string|string[], clientAnswerId: string, responseTimeMs?: number }
201/200: { result: { correct, score, feedbackVi, idempotent, nextRound? } }
```

Public lesson/game DTOs exclude `validatorJson`, correct answers, private source snapshots, provider requests and unneeded learner evidence. Dynamic route params are awaited per current Next Route Handler convention.

## Error table

| Boundary | Invalid condition | Required result |
|---|---|---|
| Provider (except upstream 429) | no key/config, network timeout, non-429 non-2xx, no expected completion content, JSON/Zod mismatch | `AI_UNAVAILABLE`; record non-secret diagnostic only |
| Provider upstream 429 | provider capacity/rate limit after a reservation | `AI_RATE_LIMITED`, HTTP 503 with bounded retry hint; settle reservation failed |
| Shared call budget | pending lease, applicable 12-second cooldown, 40 rolling/day reservations | `AI_REQUEST_LIMIT`, HTTP 429 + `Retry-After`; no upstream request |
| Worker D1 commit | zero-change conditional fence, duplicate client key, native SQL failure | exact duplicate readback or 409/error; never partial acceptance |
| Lesson API | unsupported skill, payload too large, provisioning quota | 400 / 429, no artifact row unless status tracks a failed generation |
| Lesson attempt | cross-user/unknown artifact, unknown exercise, duplicate client ID | 404 / 400 / idempotent prior result |
| Game API | unknown mode, no selectable vocab, stale/foreign run/round | 400 / 409 / 404; never select arbitrary global content client-side |
| Import | input count/hash/schema differs from manifest | exit nonzero before D1 command |

## Acceptance evidence

- Unit tests parse the schemas and assert the public DTO never contains `validatorJson` or `correctAnswer`.
- Provider transport tests assert the selected protocol: Kira uses Chat Completions plus JSON/Zod validation; OpenAI uses Responses `store:false` plus strict schema. Neither fixture or browser payload contains a key.
- API tests exercise every error class and idempotent replay path.
