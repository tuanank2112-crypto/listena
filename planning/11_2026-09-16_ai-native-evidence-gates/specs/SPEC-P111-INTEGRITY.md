# P111/P112 — Learning and authoring integrity

## P111 exact service contract

Keep `submitAttempt(params: SubmitAttemptParams): Promise<IdempotentResult<SubmitAttemptResult>>` and `reviewFlashcard(params: ReviewFlashcardParams): Promise<IdempotentResult<ReviewFlashcardResult>>`. Persist the versioned receipt defined in 01-CONTRACTS in the same core transaction. API key remains required even if an internal legacy type still permits omission; remove implicit random-key behavior from retry-capable service callers.

1. Validate owner, published lesson/exercise membership and normalized request before reserve/commit. Exact committed replay compares canonical payload and reads persisted receipt; no assessment/provider recomputation. Replay checks receipt before relying on a target's later publication state; revoked/foreign access still fails privately.
2. First writer's unique key collision is resolved by fresh owner/key readback and hash comparison. A race loser returns replay/pending/conflict, never generic500 for an expected unique conflict.
3. Flashcard stale `UPDATE ... revision=?` MUST abort inside `withLibSqlWriteTransaction` before commit. Check `rowsAffected === 1`, throw and rollback on zero. Checking changes after committed batch is CẤM. No transaction includes network I/O.
4. Every writer of a shared VocabularyMastery row, including attempt remediation, increments revision. Root audits repo call sites so review cannot overwrite a later attempt update from an apparently unchanged revision.
5. Distinct attempts use `withLibSqlWriteTransaction`: read current profile/skill values through that write transaction, compute with existing `updateMastery`, then write counters/minute/mastery/receipt before committing. Reads before the write transaction cannot be the update basis. Root audits shared mastery writers and repairs any stale snapshot overwrite found; all VocabularyMastery writers bump revision. Preserve existing scoring inputs/constants. Transaction failure is reconciled by the same client key, not an unbounded retry loop.
6. Vocabulary identities may be read beforehand, but new course/vocabulary entities owned by an intent MUST be inserted in its transaction; failure cannot pollute the shared catalog. Existing lemma races resolve conflict-safe IDs within transaction.

### Client intent lifecycle

`PendingIntent<T>` stores the entire accepted body including elapsed time, ratings/answer, hint/replay counts and playbackRate. Hash and key do not change on retry. Owner-scoped sessionStorage persists through reload; clear on sign-out/owner switch/terminal acknowledgement, store no validators, and expire uncommitted intents after24h with reconciliation before any fresh key. Raw answer remains local to the learner tab; do not log/upload it to acceptance artifacts.

- Lost response: read/poll or resend exact body/key. User changing answer/rating creates a new intent only after the prior outcome is reconciled; UI explains pending state and blocks accidental changed-body retry.
- Definitive no-commit validation response: allow edit/new intent. Unknown network/503 is not evidence of no commit.
- Stale schedule conflict: restore latest queue and reconcile the losing intent; do not replay a fabricated ReviewLog. New key may be used only for an explicit new review from fresh state.

## P112 exact service contracts

Keep `reserveLessonCreationRequest(input): Promise<ReserveResult>`, `commitLessonGraph(input): Promise<{lessonId:string}>`, `createLessonFromRequest(input)` and `generateLessonFromRequest(input)` in the existing authoring service. Root freezes schema once; P111/P112 cannot create competing migrations.

Reservation is atomic owner/key insert-or-read plus hash/mode compare. FAILED→PENDING recovery uses CAS on prior status and lease; one winner. Expired AI PENDING reconciles to UNKNOWN unless it is durably known no provider dispatch occurred. A bounded expired manual request may return FAILED after checking no committed graph, permitting explicit same-intent recovery. No endless 1-second pending response without recovery state.

Graph transaction covers optional default course, vocabulary conflict-safe inserts, Lesson, segments, exercises, target joins, safe AI trace, durable receipt and ledger transition. Ledger commit predicate MUST include owner/request/hash/mode, status=PENDING and expected lease identity; zero affected rows aborts the full graph transaction. Course ownership and valid target state are checked inside this boundary. Fresh success readback is owner-scoped. Provider calls never run inside it.

AI sequence: reserve intent → reserve budget linked to request ID → provider dispatch → Zod validate → graph/trace/receipt commit → settle budget success. Missing config/quota pre-dispatch failure finalizes request as safely FAILED. Timeout/transport ambiguity after dispatch becomes UNKNOWN; exact replay cannot auto-dispatch again. Validation failure after received output records the terminal validation failure and requires explicit new intent for regenerated content; do not silently call twice on same key. If settlement fails after graph commit, replay returns the committed graph and reconciles settlement without generating again.

`publishLesson({lessonId,userId,role}): Promise<{status:"PUBLISHED"}>` requires ≥1 segment, ≥1 exercise and ≥1 `LessonVocabulary.isTarget=true` with all relationships intact at commit; snapshot checks then unguarded update are insufficient. No auto-publish historical drafts.

Teacher new-page manual and AI requests MUST send frozen UUID+body with the same retry lifecycle. Integration test uses the actual page rather than hand-crafted complete payloads. Generic errors, including generate-lesson catch, return opaque INTERNAL_ERROR; canary tests capture response/log.

## Forbidden zone

- CẤM lower assertion strength, catch conflict as successful replay, or mock the database in concurrency/fault acceptance cases.
- CẤM change scoring/SRS rules as an incidental retry fix, synthesize learning evidence, or use self-rated flashcards as proof of ability.
- CẤM claim exactly-once external provider billing; local durable ledger only prevents authorized duplicate dispatch where outcome is known. Unknown stays unknown.
- CẤM seed/reset/migrate any current user/hosted database during implementation tests.

## Error/caller matrix

| Failure | State | Required caller |
|---|---|---|
| Same-key race | one receipt/core graph | return durable replay or pending; no new key |
| Stale review | zero losing log/deltas | reload latest schedule; deliberate new review only |
| Core fault at N | zero new entities/log/counters/receipt | opaque error, reconcile/retry same key |
| Pre-dispatch AI failure | safely FAILED | show typed failure, explicit recovery |
| Post-dispatch uncertainty | UNKNOWN, no partial graph | no auto-call, explicit reconciliation |
| Post-commit settlement failure | COMMITTED graph | return receipt, recover budget bookkeeping |
| Non-target-only publication | unchanged draft |409 LESSON_GRAPH_INCOMPLETE |

## Measured input and acceptance

Current probe [1,0] persists1 stale log; teacher manual+AI lack key; retry timing changes hash. Required fixed evidence: losing log/deltas=0, 20 concurrent same-key calls → exactly1 graph/receipt and all responses replay/pending without500; 20 distinct attempts →20 counters and mastery equivalent to a permitted serial commit order. Inject fault at every graph statement, including catalog/course/trace/receipt/ledger; before/after fingerprints unchanged except explicitly documented reservation failure metadata. Full first-result/replay deep equality, even after later reviews or unpublish, is mandatory. Provider dispatch counter ≤1 for same intent under setup/quota/timeout/graph/settlement faults. Local DB + actual UI E2E first; permitted hosted suite separate.
