# Operations — provider, D1 and rollback

## Ordered deployment procedure

1. Run migrations locally and against the controlled D1 procedure; verify no reset/seed action appears.
2. Build and validate core import SQL; record pre-import remote aggregate counts; execute it once; record post-import counts.
3. Set Kira's non-secret Worker variables: `AI_PROVIDER=kira`, `KIRAAI_MODEL=glm-5.3-flash-free`, and `KIRAAI_BASE_URL=https://kiraai.vn/api/v1`.
4. Build and deploy the P65/Kira code **while `KIRAAI_API_KEY` is absent**. Verify public health/auth and, where an authorized test account exists, the honest missing-key behavior. Do not use a chat-supplied key to bypass this phase.
5. The account owner adds a **freshly rotated** `KIRAAI_API_KEY` directly in the Cloudflare Worker Secret UI (or runs `npx wrangler secret put KIRAAI_API_KEY` privately). Do not paste a value into a command transcript, git or a config file.
6. Verify `npx wrangler secret list` only lists the secret's name, then make one authenticated bounded private-lesson request and inspect its safe provenance/result.
7. Record Worker version, D1 migration/import proof and acceptance outcome in project knowledge.

OpenAI is an alternative, not a Kira URL alias: replace the selected non-secret variables with `AI_PROVIDER=openai`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, install `OPENAI_API_KEY` as a secret, build/deploy, then smoke the OpenAI Responses path. Do not send a Kira key to an OpenAI endpoint or configure OpenAI's Responses adapter with Kira's URL.

## Rollback

- Code rollback: deploy the prior verified Worker version only if it still understands the additive schema. It will not use the new private rows, but must not delete them.
- Provider incident: remove/rotate only the hosted secret or set the runtime provider unavailable; generation returns the honest 503. Existing READY lessons/games remain readable.
- Dataset incident: do not roll back via deletion. Fix the builder/data and execute an idempotent corrective upsert after reviewing exact affected stable IDs.
- Migration failure: stop before app deploy, preserve D1 state, inspect D1 error and create a forward-only corrective migration.

## Resource guardrails

| Resource | Limit/guard |
|---|---|
| Workers Free CPU | avoid bcrypt/LLM loops in a request; each generation one upstream call and ≤20s wall timeout |
| D1 queries | game run bounded bulk selection; answer path ≤12 logical commands; no N+1 result processing |
| D1 writes | one evidence/memory update per accepted answer, idempotent duplicate handling |
| Fresh game runs | server-owned `startedAt` only; at most 1 per learner/10 seconds and 12 per rolling 24 hours; 429 includes `Retry-After`, clients do not poll or auto-retry |
| Provider cost | persisted lesson reuse, one active request/user window, no page-render invocation |
| Shared live provider calls | native D1 reservation: 1 pending lease/30 seconds and 40 reservations/rolling 24 hours per learner; repeat one-off purpose calls wait 12 seconds, while learning-loop `start_mission`/`evaluate_turn` can continue after a settled reply or CTA; reject with `AI_REQUEST_LIMIT` 429 before upstream |
| D1 mutation integrity | P65 learning-session, private-lesson/attempt and adaptive-game graphs use one parameterized native `DB.batch()` + commit fence; never Prisma callback transaction |
| Prompt size | bounded recent evidence/turns/sources; hash provenance instead of storing raw full prompts |

## Errors and operator response

| Signal | Operator action |
|---|---|
| Worker 1102 / CPU excess | inspect request route/CPU metrics, remove synchronous expensive work; do not disguise as AI outage |
| D1 quota/limit response | pause provisioning burst, inspect rows/read-write metrics, wait for reset or upgrade intentionally |
| `GAME_RATE_LIMIT` burst | do not weaken the per-learner guard or add browser retries; inspect client interaction loops and only retry after the returned `Retry-After` |
| `AI_REQUEST_LIMIT` burst | do not add browser/provider retries or an in-memory bypass; inspect reservation rows/interaction loops and wait for returned `Retry-After` |
| native D1 batch/fence error | stop the affected write path, inspect static SQL and binding/runtime metrics; never compensate by replaying partial writes |
| 401/403 from provider | validate hosted secret name/value outside logs, rotate if compromised |
| unexpected dataset counts | stop deployment and compare manifest/builder output before any corrective write |

## Acceptance evidence

- `wrangler secret list`, deploy output and D1 aggregate commands are retained as name/count/version evidence only.
- P65 code deployment is a separate gate; the live-provider server gate remains unchecked until the user-owned secret has been installed and a deliberately bounded smoke request succeeds.
