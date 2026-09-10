# Operations and rollback

## Environment order and write fence

1. Local SQLite is for code, tests, and build only.
2. A disposable Turso staging database receives a rehearsal snapshot and passes P73.
3. Vercel Preview starts with APP_RUNTIME=vercel and MIGRATION_WRITE_MODE=disabled against Turso staging.
4. Only after the disabled-preview evidence is recorded may staging change explicitly to MIGRATION_WRITE_MODE=enabled for bounded mutation, ownership, and AI tests.
5. Production uses a newly created Turso database built from the final fenced D1 snapshot, never the staging database.
6. Vercel production starts in MIGRATION_WRITE_MODE=disabled. It remains mutation-disabled through production acceptance; a separate explicit cutover approval is required before setting enabled.

The write-mode fence is fail-closed. When disabled, unsafe application API methods MUST be blocked before their database work with `503/MIGRATION_WRITE_DISABLED`, including registration. The Proxy matcher deliberately excludes Auth.js routes under `/api/auth/**` so its CSRF/session behavior remains framework-owned; that narrow login exception does not authorize general registration, learning, game, lesson, AI-reservation, or teacher writes.

## Required hosted configuration

| Setting | Preview | Production | Required behavior |
|---|---|---|---|
| APP_RUNTIME | vercel | vercel | Must be set explicitly in the Vercel dashboard. VERCEL and VERCEL_ENV are guards only and may not be exposed to the runtime. |
| MIGRATION_WRITE_MODE | disabled first; enabled only for bounded staging mutation proof | disabled throughout acceptance; enabled only after final approval | The value is recorded with deployment commit and change time. Missing or invalid values fail closed. |
| TURSO_DATABASE_URL and TURSO_AUTH_TOKEN | staging target only | freshly imported production target only | Entered in target secret settings; never printed, copied, or committed. |
| NEXTAUTH_SECRET or AUTH_SECRET | freshly generated target value | freshly generated target value | Never reuse the Cloudflare signing secret. A new secret deliberately invalidates prior sessions, so users must sign in again on the Vercel origin. |
| AUTH_URL or NEXTAUTH_URL | Preview origin | final public Vercel origin | Must match the deployed origin and not retain the workers.dev origin. |
| Kira configuration and key | target provider settings | target provider settings | Verify names and redacted binding state only; never inspect a value. |

## Pre-cutover and final-export runbook

1. Confirm Vercel Hobby remains suitable for the user's non-commercial use and record current quota/headroom. This is capacity evidence, not an uptime guarantee.
2. Confirm Turso quota/headroom, recovery expectation, and a separately owned backup process.
3. Complete P71/P72 local gates, then P73 on a disposable staging database.
4. Deploy the exact candidate commit to Vercel Preview with APP_RUNTIME=vercel and MIGRATION_WRITE_MODE=disabled. Prove Node build, health, read paths, Credentials login for an existing staging user, and the proxy write fence without mutating the staging fingerprint.
5. Change only the Preview write-mode setting to enabled, record who/when/commit, then run the bounded server-authoritative mutation, ownership, idempotency, persistence-after-restart, and live-provider tests. Preview is never connected to production Turso or D1.
6. Obtain explicit approval for the production maintenance window. Notify users that new Vercel sessions require reauthentication because the target uses a fresh auth secret.
7. Set the Cloudflare application to mutation-disabled maintenance and verify that unsafe application writes cannot reach D1. Establish the P73 read-only export fence: only read-only D1 fingerprints and the final export are permitted.
8. Create a new Turso production database from that final snapshot and pass the complete P73 verification again. Do not promote the staging database.
9. Deploy the same green Preview commit to Vercel production with APP_RUNTIME=vercel and MIGRATION_WRITE_MODE=disabled. Run only disabled-window health, read, existing-user login, ownership-read, and blocked-write evidence. Do not announce or switch public traffic yet.
10. Obtain a separate explicit decision to set MIGRATION_WRITE_MODE=enabled and switch public traffic. Record the exact deployment/version, target database identifier, approval time, and first write-enabled time.
11. Run health, authentication, one server-authoritative mutation, private ownership, idempotency, persistence-after-fresh-request, and one bounded provider smoke. Announce the new origin only when these pass.

## Rollback and reconciliation boundary

| Situation | Required action | Data consequence |
|---|---|---|
| Before Vercel target writes are enabled | Return to the unchanged Cloudflare deployment/origin if needed. | Lossless from the database perspective: D1 remains the final source snapshot and no Turso-only learner writes exist. |
| Vercel build, health, auth, or read acceptance fails while disabled | Keep Cloudflare unchanged; repair Preview or production staging. | No target write may be accepted. |
| P73 target mismatch before write enable | Discard only the target database and retry from a new approved snapshot. | D1 is retained unchanged. |
| After Turso accepts writes | Do not silently route back to Cloudflare. Freeze or degrade the target as needed, assess reconciliation, and obtain explicit approval before any reverse migration or source write. | A rollback can lose Turso-only registrations, evidence, attempts, lessons, or reservations unless a reviewed reconciliation succeeds. |
| Quota or provider incident | Return typed unavailable/rate-limited behavior and assess capacity. | Never silently substitute a local database or fabricate an AI result. |

The fresh Vercel auth secret means a Vercel session cannot be assumed valid on Cloudflare, and a Cloudflare session cannot be assumed valid on Vercel. Authentication is re-established on the active origin; rollback communication MUST mention this user-visible effect.

## Forbidden zones

- Do not enable writes merely because a deployment builds, a health endpoint responds, or a database exists.
- Do not permit a production target to receive writes before the final fresh-snapshot verification and explicit write-enable decision.
- Do not mutate D1 during the maintenance/export fence, dual-write between hosts, or automatically write Turso changes back to D1.
- Do not copy, print, commit, paste, or request secret values in a report, screenshot, terminal transcript, or environment example.
- Do not claim Hobby provides permanent 24/7 availability or an SLA, and do not use keep-awake traffic to evade a provider policy.

## Failure classification

| Failure | Required behavior |
|---|---|
| APP_RUNTIME absent or not vercel in Preview/Production | fail closed before database work; correct provider configuration |
| write-mode absent, invalid, or disabled | reject unsafe API writes; retain the unchanged database fingerprint |
| stale auth cookie/session after new secret or origin | require fresh sign-in; do not weaken signing/cookie checks |
| D1 maintenance/export fence is not demonstrably read-only | abort cutover and leave Cloudflare active |
| deployment or target health failure before write enable | leave Cloudflare as the live rollback asset and repair the target |
| post-write target failure | freeze/assess target, create a reconciliation plan, and disclose possible data loss before routing back |

## Operational evidence

- Record Vercel commit, origin, APP_RUNTIME value, write-mode transitions, and redacted deployment outcome.
- Record non-sensitive Turso database identifiers and the fresh-production-versus-staging distinction.
- Record redacted P73 source/target fingerprints, migration-file hashes, maintenance-fence start/end, and export identity.
- Record fresh-auth-session behavior and smoke timestamps/outcomes without messages, passwords, prompts, tokens, or secret fragments.
