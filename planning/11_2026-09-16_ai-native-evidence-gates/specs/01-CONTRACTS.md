# Contracts — Plan11

## Existing API and durable replay

Keep request signatures of `POST /api/attempt` (`SubmitAttemptSchema`), `POST /api/flashcard` (`ReviewFlashcardSchema`), `POST /api/teacher/lesson` (`CreateLessonSchema`) and `POST /api/teacher/generate-lesson` (`GenerateLessonSchema`). UUID client keys remain required. Never make missing keys silently create a new intent.

```ts
type MutationReceipt<T> = { replayed: boolean; result: T };
type PendingIntent<T> = { clientKey: string; payload: T; canonicalHash: string; createdAt: string };
type ReviewResult = { reviewLogId: string; flashcardId: string; nextReviewAt: string;
  intervalDays: number; easeFactor: number; repetitionCount: number };
```

These are internal contracts. Existing HTTP responses stay flat `{replayed,...value}`; do not silently nest response fields and break consumers. First commit and all exact replays return equivalent result fields except `replayed` and HTTP first-create status. Snapshot results cannot be reconstructed from later-mutated mastery. Attempt receipt preserves complete original assessment and known enrichment status; `not_requested` cannot replace known available feedback.

P110 MUST freeze this additive storage before implementation: nullable `resultJson String?` on Attempt/ReviewLog, serialized version `attempt-result-v1`/`review-result-v1`; Attempt additionally has `enrichmentState String @default("NOT_REQUESTED")`, `enrichmentLeaseId String?`, `enrichmentLeaseExpiresAt DateTime?`. Allowed states: NOT_REQUESTED, PENDING, AVAILABLE, UNAVAILABLE, RATE_LIMITED, UNKNOWN. No new LearnerProfile revision field: use the write-transaction contract below. No migration is created by this planning turn. Old rows with no snapshot require a typed `LEGACY_RESULT_UNAVAILABLE` 409 on requested receipt replay, no invented defaults; ordinary history remains readable. Client offers history navigation; never re-submit an already committed intent automatically. Root records exact migration names, timestamp policy and old-row query counts before schema execution.

An open-response core commit reserves enrichmentState=PENDING with one lease UUID and30second expiry, then dispatches outside the transaction once. A replay during PENDING returns409 OUTCOME_PENDING; it does not dispatch. Enrichment terminal updates compare attempt owner/id, leaseId and state=PENDING, atomically store the complete receipt and state AVAILABLE/UNAVAILABLE/RATE_LIMITED. Expired PENDING reconciles to UNKNOWN with an honest unavailable receipt; expiry never permits another automatic dispatch. NOT_REQUESTED applies only to a genuinely non-enriched intent. Receipt is stable after terminal transition; pending responses are not successful receipts. Known terminal feedback cannot be replaced by fabricated defaults.

```ts
// New internal helper in the existing libSQL persistence module:
withLibSqlWriteTransaction<T>(run: (tx: import("@libsql/client").Transaction) => Promise<T>): Promise<T>;
```

Helper opens `client.transaction("write")`, runs all reads/writes through that tx, commits only after every invariant/readback check succeeds, rolls back on any exception and closes in finally. Mutation services use this boundary for current-state read/compute/write, collision guards and receipt persistence. No Prisma reads/writes using another connection or provider/network calls occur inside the callback. Preserve the current batch helper for existing atomic paths; do not globally rewrite them.

## Recommendation contract extension

Extend current `LearningDecision` additively. `p08-v1` remains parseable; new decisions use `p11-v1`.

```ts
type CausalBasis =
  | { kind: "EVIDENCE"; skillKey: string; refs: EvidenceRef[] }
  | { kind: "DUE_REVIEW"; vocabularyItemId: string; dueAt: string }
  | { kind: "DECLARED_GOAL"; intentRevision: number }
  | { kind: "ACTIVE_SESSION"; sessionId: string }
  | { kind: "INSUFFICIENT_EVIDENCE" };
// Existing EvidenceRef stays source: "LEARNING" | "ADAPTIVE", id: string.
type DecisionExtension = { decisionVersion: "p11-v1"; basis: CausalBasis };
```

Evidence refs for an EVIDENCE basis MUST match selected skill/error and current owner, max12. Stale/missing provenance downgrades reason to insufficient evidence/declared goal; no strong claim from SkillMastery alone. Due review is a schedule claim, not proficiency evidence. Owned IDs in public DTO cannot include validator/raw-memory/private third-party content. P114 updates every consumer and tests both decision versions.

## Worker evidence receipt

```ts
type AcceptanceReceipt = {
  wp: string; commitSha: string; environment: "local"|"ci"|"preview"|"production"|"pilot";
  command?: string; exitCode?: number; counts?: Record<string,number>;
  artifacts: string[]; invariants: string[]; limitations: string[];
  gate: "PASS"|"FAIL"|"UNVERIFIED"; reviewedBy: string;
};
```

BẮT BUỘC root reviews receipt against actual assertion/readback and exact candidate. CẤM accept undefined count/URL as PASS or store secrets/raw learner transcripts in tracked artifacts. Receipt is in the spec acceptance ledger, no new runtime endpoint.

## Errors and acceptance

| Error | HTTP / caller |
|---|---|
| Same key/body | 200 replay from durable result, no mutation/provider |
| Same key/changed body | 409 IDEMPOTENCY_CONFLICT; user distinguishes new intent |
| Stale revision | 409 OUTCOME_PENDING, rollback all intent rows; reconcile latest schedule before new submission |
| Pending/unknown provider outcome | typed pending/unknown; poll/reconcile same key, no auto new key |
| Missing legacy snapshot | 409 LEGACY_RESULT_UNAVAILABLE; history link, no fabricated receipt |
| Missing/foreign content | safe 400/404 or authorized role403; no provider call |
| DB/internal error | opaque503/500; no driver/message content |

Review probe: both teacher bodies rejected solely for missing UUID; both elapsed fields change canonical hash. Acceptance requires zero key/payload drift across retries and zero changed receipt fields across exact replay. Detailed DB measurement matrix is in P111/TESTING-ACCEPTANCE.
