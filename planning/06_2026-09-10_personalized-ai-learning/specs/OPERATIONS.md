# Operations — provider, D1 and rollback

## Ordered deployment procedure

1. Run migrations locally and against the controlled D1 procedure; verify no reset/seed action appears.
2. Build and validate core import SQL; record pre-import remote aggregate counts; execute it once; record post-import counts.
3. Set non-secret Worker variables: `AI_PROVIDER=openai`, `OPENAI_MODEL`, and optional HTTPS `OPENAI_BASE_URL`.
4. The account owner runs `npx wrangler secret put OPENAI_API_KEY` interactively. Do not paste the value into chat, a command transcript, git or a config file.
5. Verify `npx wrangler secret list` only lists the secret's name, build the Worker, deploy and inspect health/auth plus explicit AI-unavailable/live-provider smoke behavior.
6. Record Worker version, D1 migration/import proof and acceptance outcome in project knowledge.

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
| Prompt size | bounded recent evidence/turns/sources; hash provenance instead of storing raw full prompts |

## Errors and operator response

| Signal | Operator action |
|---|---|
| Worker 1102 / CPU excess | inspect request route/CPU metrics, remove synchronous expensive work; do not disguise as AI outage |
| D1 quota/limit response | pause provisioning burst, inspect rows/read-write metrics, wait for reset or upgrade intentionally |
| `GAME_RATE_LIMIT` burst | do not weaken the per-learner guard or add browser retries; inspect client interaction loops and only retry after the returned `Retry-After` |
| 401/403 from provider | validate hosted secret name/value outside logs, rotate if compromised |
| unexpected dataset counts | stop deployment and compare manifest/builder output before any corrective write |

## Acceptance evidence

- `wrangler secret list`, deploy output and D1 aggregate commands are retained as name/count/version evidence only.
- Server exit gates remain unchecked until the user-owned secret has been installed and a deliberately bounded smoke request succeeds.
