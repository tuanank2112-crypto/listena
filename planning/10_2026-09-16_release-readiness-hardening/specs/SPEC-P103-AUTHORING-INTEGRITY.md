# P103 — Teacher authoring integrity

## Objective

Give manual and AI lesson creation one durable request contract so provider calls, lesson graphs, vocabulary joins and retries cannot leave ambiguous or partial authoring outcomes.

## Request ledger state machine

```text
new key -> PENDING -> COMMITTED
                  -> FAILED       (known safe failure, explicit retry policy)
                  -> UNKNOWN      (provider may have completed; do not auto-call again)
```

`reserveLessonCreationRequest` must atomically insert or read the owner/key row and compare `requestHash` + `mode`. A PENDING lease has a bounded expiry, but expiry alone does not authorize a second external provider call. AI UNKNOWN requires an explicit recovery decision; manual PENDING can be reconciled from `lessonId`/graph state.

## Service contracts

```ts
reserveLessonCreationRequest(input: {
  userId: string;
  clientRequestId: string;
  requestHash: string;
  mode: "MANUAL" | "AI";
  now: Date;
}): Promise<
  | { kind: "reserved"; requestId: string }
  | { kind: "replay"; lessonId: string }
  | { kind: "pending"; retryAfterSeconds: number }
>;

commitLessonGraph(input: {
  requestId: string;
  userId: string;
  role: "TEACHER" | "ADMIN";
  draft: ValidatedLessonDraft;
  source: "manual" | "ai";
  aiTrace?: SafeAITrace;
}): Promise<{ lessonId: string }>;
```

`commitLessonGraph` is one atomic batch for: optional owned default course creation/selection fence, Lesson, segments, exercises, vocabulary upserts, LessonVocabulary joins, AI trace (AI mode), and request `COMMITTED + lessonId`. Course/lesson ownership and status are revalidated in the batch. The success response is emitted only after fresh owner-scoped readback.

For AI mode: reserve request → reserve AI budget using request ID → call provider once → validate output → atomic graph/trace/request commit → settle reservation. If the provider returns but graph commit fails, request becomes `UNKNOWN`; automatic retries must not call the provider again. A reconciliation method may reuse the validated server-held result only if it is durably stored without secret/validator leakage; otherwise require explicit new user action/key.

## Publishing contract

Publish/review actions receive a Zod-validated body and remain owner/admin scoped. Publish must reject lessons without minimum graph integrity:

```ts
type PublishPreconditions = {
  segmentCount: number;   // >= 1
  exerciseCount: number;  // >= 1
  targetVocabularyCount: number; // >= 1
};
```

This is a content-integrity check, not a claim of pedagogical quality.

## Forbidden zone

- CẤM network/provider calls inside DB batch/transaction.
- CẤM settle an AI reservation as successful before a durable trace and graph are committed.
- CẤM silently reuse another teacher's course/lesson/vocabulary-private relation.
- CẤM return the lesson as created if any segment/exercise/join is missing.
- CẤM publish partial historical DRAFTs automatically; audit/report them for a teacher/admin decision.

## Error matrix

| Error | Ledger | HTTP/caller behavior |
|---|---|---|
| validation/forbidden | no row or FAILED safe code | 400/403; no provider |
| exact committed replay | COMMITTED | success with same lesson ID, `replayed:true` |
| key/body conflict | unchanged | 409; new key only for new intent |
| provider unavailable before output | FAILED typed | provider status; explicit retry policy |
| provider outcome uncertain | UNKNOWN | 409/425; no automatic provider retry |
| graph batch failure | PENDING/UNKNOWN according to whether provider ran; zero graph rows | opaque 503; reconcile same request |
| publish graph incomplete | unchanged DRAFT/REVIEWED | 409 `LESSON_GRAPH_INCOMPLETE` |

## Acceptance evidence

- Fault injection at course, lesson, segment, exercise, vocabulary, join, trace and ledger statements leaves zero partial graph.
- Concurrent exact replays create one provider call, one lesson and one set of joins.
- Cross-teacher tests return owner-private/forbidden outcomes without content leak.
- A migration audit query lists historical DRAFT graph gaps; it is read-only and does not auto-fix/delete them.

