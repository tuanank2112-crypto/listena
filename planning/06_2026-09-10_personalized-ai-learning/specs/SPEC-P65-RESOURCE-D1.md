# P65 — Resource gates and D1 atomic persistence

## Objective and scope

Make the selected Kira live-AI deployment safe to operate on Cloudflare Workers + D1. This package owns the shared per-learner upstream-call reservation, the Worker-only persistence boundary for multi-row learning writes, and the deployment proof required before a fresh hosted key is enabled.

It does not change the lesson/game product shape, provider model, curriculum, schema migration history, or the local SQLite transaction implementation.

## Exact contracts

### Shared live-AI call reservation

```ts
type AICallReservation = { id: string; userId: string; purpose: string };

reserveUserAICall(input: {
  userId: string;
  purpose: "personalized_lesson" | "start_mission" | "evaluate_turn"
    | "dataset_tutor" | "error_analysis" | "lesson_generation";
  requestIdentity?: string;
  provider?: string;
  model?: string;
}): Promise<AICallReservation>;

settleUserAICall(reservation: AICallReservation, outcome: {
  success: boolean;
  provider?: string;
  model?: string;
  requestId?: string;
  failureReason?: string;
}): Promise<void>;
```

`AIInteraction` is a state-transition reservation ledger: a reservation uses `purpose='ai_call_reservation'`, a SHA-256 request identity hash, `success=false`, `schemaValid=false`, and `fallbackReason='AI_CALL_PENDING:<purpose>'`; settlement updates that same row to a bounded success/failure outcome. It stores neither prompt text, learner answer, nor credential.

| Constant | Required value | Meaning |
|---|---:|---|
| `AI_REQUEST_MIN_INTERVAL_MS` | 12,000 | no second one-off provisioning/tutor/admin request of the same purpose during this cooldown; learning-loop `start_mission` and conversational `evaluate_turn` are exempt so the next-action flow can continue naturally |
| `AI_REQUEST_DAILY_LIMIT` | 40 | maximum reservations for one learner in rolling 24 hours, across all listed purposes |
| `AI_REQUEST_ROLLING_WINDOW_MS` | 86,400,000 | quota window |
| `AI_REQUEST_PENDING_LEASE_MS` | 30,000 | pending request lease; prevents duplicate expensive calls |

In Worker/D1, reservation MUST be a single parameterized `INSERT … SELECT … WHERE` on the native binding. The predicate counts the rolling reservation window and rejects an unexpired pending lease plus the cooldown when that purpose has one. A stale read followed by a Prisma create is forbidden in Worker runtime. In local Node/SQLite, the same helper may use Prisma solely for test/dev behavior.

Every caller MUST reserve immediately before an outbound provider request, settle `success:false` on transport/schema failure, and settle `success:true` with bounded provider/model/request-ID metadata after validated provider output. Required call sites are private personalized lesson provisioning, Mission/Daily Quest/Lesson Coach start, Mission turn evaluation, dataset tutor, legacy open-response analysis, and teacher lesson generation.

### Native D1 batch boundary

```ts
type D1BatchStatement = {
  sql: string;
  values?: Array<string | number | null>;
};

executeNativeD1Batch(statements: D1BatchStatement[]): Promise<
  Array<{ success: boolean; meta: { changes?: number } }>
>;
```

The helper prepares and binds every value, then sends the ordered list once through native `env.DB.batch()`. In Worker runtime, these multi-record boundaries MUST use that helper rather than callback-form `prisma.$transaction()`:

| Boundary | Commit fence / required outcome |
|---|---|
| private lesson ready + vocabulary + provenance | `GENERATING` row ID + fresh `generationKey`; only the winning batch can turn the row READY |
| private lesson attempt/evidence/mastery/calibration | new attempt UUID and new evidence UUID; duplicate `clientAttemptId` is readback-only |
| adaptive run + rounds | conditional new run insert against server-owned cooldown/rolling limit; all rounds depend on that row |
| adaptive answer/evidence/mastery | temporary per-request claim token; final statement swaps it for browser `clientAnswerId` |
| mission start | preassigned session/opening/intervention/provenance IDs; all rows commit together |
| mission turn | learner-turn UUID plus expected `LearningSession.stateJson`; child writes depend on that exact turn |
| session event and completion | expected active state/session status; exact event ID or completion transition is the fence |

Node/SQLite retains the pre-existing callback transaction implementation because it is the local test/runtime path. D1 read queries via Prisma are allowed when they do not claim atomicity; no D1 write correctness may depend on a Prisma interactive transaction.

## MUST / MUST NOT

MUST:

- Return `AI_REQUEST_LIMIT` with HTTP 429 and `Retry-After` when reservation rejects. Clients show the retry hint and MUST NOT auto-poll/retry. `start_mission`/`evaluate_turn` remain serialized by the pending lease and capped by the shared daily ledger, but have no post-response cooldown.
- Count reservations, including provider failures: a failed upstream request can still consume a provider resource.
- Fail a native batch closed when any expected commit fence reports zero changes. Reconcile an exact duplicate by reading its persisted record; otherwise return the existing conflict/error path.
- Keep all raw values in `D1PreparedStatement.bind`; static SQL text may not interpolate learner input, IDs, model output, or provider data.
- Restrict Kira to the canonical HTTPS base `https://kiraai.vn/api/v1` and reject redirects; a bearer credential must never follow a different origin.
- Use a fresh Worker secret after a key has been exposed in chat or logs; only its name may be verified with `wrangler secret list`.

MUST NOT:

- MUST NOT add a database reset, destructive import, provider-key migration, or persistent quota table migration for this package.
- MUST NOT use `prisma.$transaction([...])` as a purported D1 ACID replacement.
- MUST NOT downgrade a rejected reservation to a browser-side timer, use a per-instance in-memory counter, or silently make a mock/fallback provider call.
- MUST NOT mark an AI call as successful merely because the transport returned text; caller schema validation remains mandatory.
- MUST NOT log or persist a provider key, bearer header, prompt body, raw learner response, or raw provider completion in the reservation ledger.

## Error classification and caller behavior

| Class / signal | Meaning | Required caller behavior |
|---|---|---|
| `AI_REQUEST_LIMIT` | pending lease, applicable cooldown, rolling 24-hour quota, or an intentionally closed concurrent reservation race | HTTP 429 + `Retry-After`; no provider request, no automatic retry |
| `AI_RATE_LIMITED` | Kira/OpenAI upstream 429 after a reserved call | typed HTTP 503 unavailable response with upstream retry hint; reservation is settled failed |
| `AI_UNAVAILABLE` | missing/invalid configuration, timeout, 401/403, network or schema validation failure | HTTP 503; settle failure if reserved; preserve prior artifact/session state |
| native batch fence = 0 | stale state, duplicate or another Worker won the claim | exact existing client ID gets idempotent readback; otherwise 409/conflict, never partial success |
| native D1 SQL/batch error | binding/schema/runtime failure | surface the server error; do not return an accepted answer/lesson and do not write a compensating partial mutation |
| Kira base URL/redirect rejection | credential egress guard | `AI_UNAVAILABLE`; operator corrects non-secret configuration, never weakens origin guard |

## Operations and rollback

1. Run local tests, type check, lint, Worker build and E2E before deploy.
2. Deploy the code/config that includes native D1 writes while `KIRAAI_API_KEY` remains absent; missing-key behavior must remain an honest 503.
3. In the Cloudflare dashboard, create/replace `KIRAAI_API_KEY` with a newly rotated value. Do not reuse a value submitted through chat and do not type it in a terminal captured by the agent.
4. Verify the secret *name* only, then make one authenticated private-lesson request. Confirm a READY artifact and non-secret `AIInteraction` provenance, plus no client response contains private validator/key data.
5. If the provider or quota fails, remove/rotate the hosted secret or leave it absent. Existing READY lessons and server-scored games remain available. Roll back only the Worker code to a schema-compatible prior version; never delete user/evidence rows to recover capacity.

## Acceptance evidence and exit gates

| Evidence | Local Node/SQLite | Local Worker/D1 SQL emulation | Public Worker + D1 |
|---|---:|---:|---:|
| Kira canonical endpoint/redirect/body/parser tests | ✅ | n/a | ⬜ smoke |
| quota decision tests and native conditional reservation SQL | ✅ | ✅ | ⬜ request/429 observation |
| native mission state-CAS SQL executes and stale replay adds no evidence | ✅ | ✅ | ⬜ authenticated smoke |
| native adaptive answer claim SQL executes and replay adds no evidence/mastery | ✅ | ✅ | ⬜ authenticated smoke |
| native private lesson/attempt fence statement contracts | ✅ | ✅ statement contract | ⬜ authenticated smoke |
| fresh hosted secret, real Kira private lesson, provenance, secret non-leak | n/a | n/a | ⬜ owner action |

P65 Worker code was deployed as version `ee5de83a-c2a9-45e3-996a-e624072bb250`; the public health/login baseline passed while the key remained absent. The public exit gate remains open until the account owner installs a fresh secret and performs one bounded genuine-provider smoke. Passing local emulation is evidence of SQL contract validity, not proof of Kira account availability or learning efficacy.
