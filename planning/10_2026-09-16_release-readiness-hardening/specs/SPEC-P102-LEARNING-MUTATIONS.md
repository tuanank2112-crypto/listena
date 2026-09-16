# P102 — Atomic and idempotent legacy learning mutations

## Objective

Make dictation/open-response attempt submission and flashcard review safe under lost responses, retries, concurrency and mid-write failures without inventing unified learning evidence.

## Attempt contract

`POST /api/attempt` requires `clientAttemptId`. Server validates owner, published lesson, exercise membership and assessment before writing.

The deterministic core commit is one parameterized libSQL atomic batch containing:

1. one `Attempt` keyed by `(userId, clientAttemptId)`;
2. all deterministic `AttemptError` rows;
3. learner profile updates using conditional/current values, not stale read-then-overwrite;
4. four SkillMastery changes with explicit evidenceCount policy;
5. flashcards and VocabularyMastery deltas created from deterministic errors.

No step may rely on a Prisma loop outside the batch. Vocabulary identity is resolved before the batch or with conflict-safe SQL; duplicate lemma races cannot create a half-attempt.

Optional open-response AI feedback is an enrichment after the core attempt has committed. It uses the committed attempt ID as request identity and may update only that attempt's errors plus a typed AI trace. A provider failure returns the deterministic assessment with `aiFeedbackStatus`, not a 500 and not a rollback of learning already committed. Exact replay must not call the provider again if a terminal enrichment trace exists.

```ts
type SubmitAttemptResult = {
  attemptId: string;
  assessment: ExistingAssessmentDTO;
  aiFeedback: ExistingAIFeedbackDTO | null;
  aiFeedbackStatus: "available" | "unavailable" | "rate_limited" | "not_requested";
  flashcardIds: string[];
};
```

## Flashcard review contract

`POST /api/flashcard` requires `clientReviewId`. Server reads an owner-scoped card/mastery snapshot, computes SM-2, then atomically inserts one ReviewLog and conditionally updates the exact expected mastery version/state.

The implementation must prevent two distinct concurrent reviews from silently calculating from the same schedule. P100 adds `VocabularyMastery.revision Int @default(0)`. The atomic update includes `WHERE userId = ? AND vocabularyItemId = ? AND revision = ?`, increments `revision` by one, and requires exactly one changed row; otherwise the batch fails and caller reloads the latest schedule. An exact replay returns the stored ReviewLog/result without increments.

```ts
type ReviewFlashcardResult = {
  reviewLogId: string;
  flashcardId: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitionCount: number;
};
```

## Mandatory / forbidden

- BẮT BUỘC preserve existing server grading and due-queue semantics.
- BẮT BUỘC use delta-safe counters and prove study minutes change once per attempt key.
- CẤM create LearningSession/LearningEvidence, backfill CEFR, or treat self-rated flashcards as server-scored evidence.
- CẤM return raw service errors. Foreign card is owner-private 404; invalid lesson/exercise is field-safe 400/404.
- CẤM make the provider call part of a database transaction or hold a DB transaction across network I/O.

## Failure matrix

| Failure | Persisted state | Caller behavior |
|---|---|---|
| Duplicate same attempt/review | one graph/log | return replayed result |
| Same ID, different body | no new state | 409 conflict |
| Batch statement N fails | zero rows/counter changes from intent | opaque 503; retry same ID |
| AI enrichment unavailable | deterministic attempt committed; typed terminal/retryable trace | render deterministic feedback; no duplicate core write |
| Concurrent distinct flashcard reviews | one commits; loser receives conflict/pending and reloads latest schedule | do not apply stale schedule |
| Foreign flashcard | none | 404 without owner disclosure |

## Acceptance evidence

- Fault inject every batch boundary and compare all affected table counts/fingerprints before/after.
- Concurrent Promise-based and route tests prove one outcome for same ID and no stale schedule for distinct IDs.
- E2E loses/duplicates an attempt and flashcard response, reloads, and observes one attempt/review/counter/minute change.
- Existing Mission/Coach/Quest and adaptive-game tests remain green; no new synthetic evidence rows exist.
