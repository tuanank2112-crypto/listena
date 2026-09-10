# Architecture and invariants

## Goal

Run the existing Next.js App Router application on Vercel's Node runtime with Turso/libSQL as its sole new production database, while preserving server-authoritative learning state, private lesson ownership, and exactly-once evidence.

## Target topology

    browser -> Vercel Next Node route -> PrismaLibSQL / libSQL atomic batch -> Turso
                                          |
                                          +-> Kira Chat Completions

Local development and isolated tests remain:

    Node Next/Vitest -> PrismaLibSQL -> local SQLite file

## Architectural invariants

1. A learner response is graded, validated, and persisted server-side. No browser field can establish correctness, mastery, or completion.
2. A multi-row learning, game, or AI-budget commit remains all-or-nothing. Conditional claims and state/version fences remain in the SQL executed by the atomic batch.
3. A private lesson, attempt, validator, learner memory, and AI provenance remain owner-bound. Turso must not expose validator JSON through a public DTO.
4. Production uses a Node runtime. Routes that use node:crypto, Prisma, Auth.js Credentials, or libSQL MUST NOT be moved to Edge.
5. A Vercel production execution with missing or partial Turso settings MUST fail closed before it opens a local SQLite file.
6. Cloudflare D1 remains immutable throughout staging. There is no dual write, background replication, reset, seed, or hand-edit of user records.
7. Secrets are named only, never logged, placed in a repository file, exported in a transcript, or copied from Cloudflare to Vercel.
8. The user must explicitly approve the final maintenance/export window and traffic cutover after staging gates pass.

## Forbidden zones

| Forbidden action | Reason |
|---|---|
| Rewriting SQLite schema to PostgreSQL during this plan | Turso preserves the current dialect; a simultaneous data-model migration makes rollback and proof ambiguous. |
| Replacing fenced SQL batches with independent Prisma writes | It can create duplicate evidence, double mastery changes, or a spent AI reservation without a persisted result. |
| Treating Vercel Hobby as an uptime SLA | Free quota and platform policy can interrupt service; documentation must say best-effort serverless availability. |
| Keeping a Vercel-local production database | Serverless filesystem is not durable and violates the persistent learner-data requirement. |
| Replaying every local Prisma migration after importing D1 | Local Prisma and deployed D1 migration histories diverge and can collide with existing schema/data. |
| Deleting Cloudflare resources immediately after Vercel deploy | A verified rollback window is required. |

## Failure classification

| Class | Examples | Required caller behavior |
|---|---|---|
| CONFIGURATION | missing TURSO_DATABASE_URL/token, unsafe local fallback on Vercel | fail request before database access; expose generic unavailable UI; never substitute mock or local storage |
| TRANSIENT_DATABASE | remote transport/network failure, bounded Turso retryable error | return typed 503; do not retry a non-idempotent write client-side |
| CONFLICT | stale learning state, claimed answer, duplicate client ID | return existing committed result or typed conflict; never apply evidence a second time |
| DATA_INTEGRITY | import fingerprint/FK/schema mismatch | block staging/cutover; retain D1 untouched and investigate |
| PLATFORM_QUOTA | Vercel/Turso limit reached | fail closed with an operational alert; do not silently downgrade persistence |
| PROVIDER | Kira unavailable, timeout, invalid output | settle reservation as failure and render the existing typed AI-unavailable state |

## Acceptance evidence

- Local Node can use the original SQLite test database and all existing persistence tests remain green.
- A Turso staging request executes identical server-authoritative learning contracts without Cloudflare imports or D1 bindings.
- An imported staging DB passes SQLite integrity and foreign-key checks, table/index/schema comparison, record counts, preserved IDs and timestamp-format checks.
- Vercel Preview returns public health/login successfully and authenticated mutation/AI smoke evidence is stored only in Turso staging.
