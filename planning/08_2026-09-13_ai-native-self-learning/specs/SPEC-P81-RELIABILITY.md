# P81 — Reliability before hosted acceptance

Status: IMPLEMENTED LOCALLY. Addresses F01–F04. Owner runtime/high; root approves schema/auth shared boundary. Hosted clone/Preview/Production proof remains OPEN.

## Write and auth contracts

- `GET /api/recommendation` retains `{recommendations}` but becomes pure read/compute; remove persistence from GET. Inventory consumers of Recommendation before removing writes; if persisted refresh is required, use authenticated `POST /api/recommendation` with existing write fence, same response shape. No silent move of writes into render/background work.
- `POST /api/register` keeps existing success payload/status and forced LEARNER role. Hash password before transaction. Generate IDs, then use the existing atomic libSQL mechanism or adapter-proven equivalent for User + one LearnerProfile + exactly six initial SkillMastery rows. Email conflict409, invalid400, database unavailable503. No partially committed graph, no password/hash in errors.
- Shared `resolveAuthSecret(env): string | undefined` uses first nonblank AUTH_SECRET, then NEXTAUTH_SECRET for both auth config and proxy; missing hosted secret fails configuration before auth is usable. Test with synthetic values only. Preserve HTTPS cookie/CSRF behavior.
- All application mutation entry points must honor disabled mode; Auth.js remains the narrow session/CSRF exception, not an exemption for learner data. GET/render paths remain read-only even when enabled.

## Start idempotency contract

Extend `POST /api/learning-sessions` JSON with required `clientStartId: UUID`. Existing mode/lessonId/goal/scenarioKey unchanged. UI creates key once per explicit start and retains it through retries. Fresh success201 `{session}`; replay200 `{session}` for the same committed session. Different body with same user/key409 IDEMPOTENCY_CONFLICT. Compare hash of normalized validated input excluding clientStartId; userId is part of unique identity, never accepted from client.

Implemented as additive Prisma migrations (`20260913000000_add_learning_session_start_requests` and `20260913010000_add_primary_learning_session_start_fence`):

```sql
CREATE TABLE LearningSessionStartRequest (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  clientStartId TEXT NOT NULL,
  payloadHash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','COMMITTED','FAILED','UNKNOWN')),
  sessionId TEXT REFERENCES LearningSession(id),
  errorCode TEXT,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  UNIQUE(userId, clientStartId),
  CHECK(status <> 'COMMITTED' OR sessionId IS NOT NULL)
);
```

Atomically claim request before AI reservation. Only claim winner may reserve/call provider. Session graph and COMMITTED/sessionId update commit in the same atomic batch; validate affected rows/claim fence. Existing turn, evidence, memory and budget fences remain mandatory.

The second migration enforces one `PENDING` primary start per user before any provider call. It normalizes legacy duplicate PENDING records before creating the partial index, with test coverage for local integer-millisecond timestamps, Turso ISO timestamps, and stable ID tie-breaking. This is a local migration test result, not proof that any hosted database has applied it.

PENDING requests return409 START_IN_PROGRESS with Retry-After2; client polls by retrying **same** POST/key, at most5 automatic attempts, then manual retry. PENDING older than120s without provable outcome is marked UNKNOWN by conditional update and returns409 START_OUTCOME_UNKNOWN. Do not automatically call provider again for UNKNOWN: reconcile DB by request/session identity; if no committed graph can be proven, offer an explicit new start with a new key and warn that a previous AI request may have been billed. No UI claim of successful session/evidence from uncertainty.

Known pre-provider failure may mark FAILED and replay the typed error; new intentional start gets a new key. Provider timeout/ambiguous transport must not be represented as guaranteed zero usage. Completed requests are retained for at least30days; no cleanup job is introduced in this package. Session deletion, if added later, must coordinate retained request tombstones rather than break FK/replay guarantees.

## Error classification / caller

| Condition | Required outcome |
|---|---|
| Disabled mode | 503 MIGRATION_WRITE_DISABLED, zero app-table writes/provider calls |
| Register step fails | Rollback all account rows; no success response |
| Duplicate email race | Exactly one complete account; loser409 |
| Missing/bad clientStartId | 400 INVALID_INPUT; user may retry after client fix |
| Same key/different body | 409 IDEMPOTENCY_CONFLICT; no generation or mutation |
| Same key/committed | 200 same owned session, no new reservation/provider invocation |
| In progress / unknown | Behavior above, keep key and draft, no automatic new key |
| Existing primary session | 409 `ACTIVE_SESSION_EXISTS`; discard terminal key and direct to owned dashboard/session; no provider call |
| Invalid provider output / unavailable | Existing typed provider error; no fake opening/evidence |
| DB commit uncertain | Re-read request; if not provably committed report unknown, never blindly create again |

## BẮT BUỘC / vùng cấm

BẮT BUỘC prove transactions on local SQLite and hosted clone; mixed deployment compatibility requires gated rollout. CẤM removing CSRF, role checks or write fence to make demo pass. CẤM claiming exactly-once upstream AI delivery: only application commit/replay is guaranteed. CẤM destructive schema reset or production seed.

## Evidence / acceptance

Local implementation evidence (2026-09-13): recommendation GET is pure read/compute and the isolated E2E fingerprints every application table before/after it with zero mutations; registration has all eight insertion-fault rollback cases plus the same-email race; auth/proxy share `resolveAuthSecret`; and start requests have durable replay, payload conflict, UNKNOWN and primary-PENDING-lease tests. The migration suite covers concurrent same-key claims, distinct-key primary-start contention, legacy duplicate normalization, local integer timestamps and Turso ISO timestamps. The integrated local suite is 387/387 tests in 78 files and fresh isolated E2E is 20/20.

Still required before release: a disposable hosted clone must prove database counts/integrity, disabled-read fingerprints, fresh HTTPS auth, retry/ownership behavior and fence restoration. No Preview, Production, cutover/rollback or live provider gate is marked complete here.
