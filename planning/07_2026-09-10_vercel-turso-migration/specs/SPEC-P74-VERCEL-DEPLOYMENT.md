# P74 — Vercel staging and controlled cutover

## Scope

Prove the Node/Turso application on Vercel Preview before any public traffic change, then perform a separately approved production acceptance window with mutations disabled. Production writes and traffic are enabled only by an explicit final decision.

## Required hosted configuration

| Setting | Required behavior |
|---|---|
| Node runtime | Use the default Node runtime for server, Auth.js, Prisma/libSQL, and AI routes. Edge is prohibited for those paths. |
| Build | Use the standard Next build, not the OpenNext Worker build. |
| APP_RUNTIME | Set APP_RUNTIME=vercel in both Vercel Preview and Production. VERCEL and VERCEL_ENV may be unavailable by provider configuration and cannot be the only selector. |
| MIGRATION_WRITE_MODE | Start each hosted environment with disabled. Only a recorded explicit change to enabled permits unsafe application mutations; missing or malformed settings fail closed. |
| TURSO_DATABASE_URL and TURSO_AUTH_TOKEN | Preview receives only staging values; Production receives only the freshly imported final target values. Values remain server-only. |
| Auth secret and public origin | Generate a fresh target-platform NEXTAUTH_SECRET or AUTH_SECRET and use the matching Vercel origin. Old Cloudflare sessions are deliberately invalid and users must authenticate again. |
| Kira configuration and key | Configure target-platform names and redacted binding state only. Do not copy secret text through source control or logs. |
| Duration | The Kira route path has a deployment-recognized bounded maxDuration compatible with the selected plan. |

## Staged deployment contract

### Disabled Preview acceptance

1. Deploy the exact candidate commit with APP_RUNTIME=vercel, Turso staging settings, and MIGRATION_WRITE_MODE=disabled.
2. Verify the artifact uses Node, health and login HTML respond, an existing disposable staging account can complete Credentials login, and read-only ownership checks work.
3. Attempt an unsafe non-auth API request and prove it is rejected before a database mutation; registration remains blocked. Auth.js under /api/auth/ is the only narrow method exception.
4. Compare the staging fingerprint before and after this window. No application-table count or semantic data may change because of disabled-window checks.

### Enabled Preview mutation proof

1. Record the approver, deployment commit, prior disabled evidence, and exact time of the change to MIGRATION_WRITE_MODE=enabled.
2. Use only a disposable staging account to prove registration or an equivalent supported write, one server-owned learning turn or game answer, idempotency on a retry, private ownership isolation, and persistence after a fresh process/request.
3. Run one bounded live Kira generation. It either succeeds or returns the existing typed unavailable/rate-limited result without a secret leak.
4. Record the target fingerprint and leave the staging database out of the production path.

### Disabled Production acceptance and final enable

1. After P73 creates and verifies a fresh production target from the final D1 export, deploy the same green commit to Vercel production with MIGRATION_WRITE_MODE=disabled.
2. Verify Node runtime, health, fresh-auth behavior, read-only ownership paths, and blocked unsafe writes. Do not announce the origin or switch public traffic.
3. Obtain separate explicit approval to set MIGRATION_WRITE_MODE=enabled and switch traffic. Record the deployment, database identifier, time, and approver.
4. Immediately prove one server-authoritative write, idempotent retry behavior, private ownership, persistence on a new request, and one bounded provider outcome. If any fail, follow the reconciliation-aware rollback rules in OPERATIONS.

## Forbidden zones

- Do not point Preview to production Turso or D1.
- Do not infer hosted runtime solely from a Vercel-provided variable, leave APP_RUNTIME absent, or allow a hosted local-SQLite fallback.
- Do not enable writes, attach a custom domain, switch DNS, or announce public traffic before the corresponding disabled-window and P73 gates are green.
- Do not treat a Vercel Preview database as the production target.
- Do not claim permanent 24/7/SLA uptime from Hobby or configure keep-awake pings to evade a free-tier policy.
- Do not treat a local Proxy test as evidence of a Vercel Preview or production deployment. The Proxy matcher deliberately excludes `/api/auth/**` so Auth.js owns CSRF/session behavior; all other unsafe application API methods return `503/MIGRATION_WRITE_DISABLED` while the gate is disabled.

## Failure classification

| Failure | Required behavior |
|---|---|
| build/bundle or Node-runtime failure | block Preview; inspect the actual module path and do not deploy with ignored failures |
| APP_RUNTIME or Turso configuration failure | fail closed before local fallback; correct target configuration without exposing values |
| disabled-mode mutation reaches a database | block all cutover work; repair the proxy fence and restore the prior target snapshot |
| auth origin/cookie failure | use the target origin and fresh auth secret, then retest with a fresh sign-in |
| stale source session is rejected | treat as expected after fresh secret; guide reauthentication rather than weakening validation |
| Turso quota or unavailable state | block write enable/cutover; expose the existing typed operation state |
| Kira failure | record the typed outcome; never replace it with a production mock |
| enabled Preview mutation mismatch | block Production and retain Cloudflare deployment |
| production failure after target writes | do not blindly return to Cloudflare; use reconciliation-aware rollback |

## Acceptance evidence

- Vercel Preview and production configuration records show APP_RUNTIME=vercel and each write-mode transition without secret values.
- Preview build logs are green, the artifact uses Node, and disabled-mode mutation tests leave its staging fingerprint unchanged.
- Enabled Preview proves fresh-session login, server-authoritative persistence, idempotency, private ownership, restart-safe reads, and bounded AI behavior on an isolated staging database.
- Production has a separate fresh-final-snapshot target, passes disabled acceptance, and has a separately recorded approval before writes or traffic are enabled.
