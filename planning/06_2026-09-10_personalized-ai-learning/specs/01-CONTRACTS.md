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
  readonly providerName: "openai";
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

The OpenAI implementation uses `POST /v1/responses`, `text.format` JSON schema with `strict: true`, `store: false`, server timeout, and server-side Zod parsing. `OPENAI_API_KEY` is required for `AI_PROVIDER=openai`. `OPENAI_BASE_URL` is restricted to an HTTPS OpenAI-compatible endpoint and `OPENAI_MODEL` is non-secret configuration.

## HTTP contract

```text
POST /api/learner/personalized-lessons
body: { targetSkill?: listening|vocabulary|spelling|grammar|communication }
200/201: { lesson: PublicPersonalizedLesson, reused: boolean }
429: { error: "PERSONALIZATION_LIMIT" | "AI_RATE_LIMITED", retryAfterSeconds }
503: { error: "AI_UNAVAILABLE", message }

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
| Provider | no key/config, network timeout, non-2xx, no `output_text`, Zod mismatch | `AI_UNAVAILABLE`; record non-secret diagnostic only |
| Lesson API | unsupported skill, payload too large, provisioning quota | 400 / 429, no artifact row unless status tracks a failed generation |
| Lesson attempt | cross-user/unknown artifact, unknown exercise, duplicate client ID | 404 / 400 / idempotent prior result |
| Game API | unknown mode, no selectable vocab, stale/foreign run/round | 400 / 409 / 404; never select arbitrary global content client-side |
| Import | input count/hash/schema differs from manifest | exit nonzero before D1 command |

## Acceptance evidence

- Unit tests parse the schemas and assert the public DTO never contains `validatorJson` or `correctAnswer`.
- Provider fetch test asserts Responses payload has `store:false`, strict schema and no browser-visible key.
- API tests exercise every error class and idempotent replay path.
