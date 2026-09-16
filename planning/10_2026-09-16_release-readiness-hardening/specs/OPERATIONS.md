# Operations — execution, deployment and rollback

## Mandatory order

1. Root records `git status`, base commit and pre-existing dirty files; no cleanup/reset.
2. P100 freezes contracts, creates one additive Prisma migration against an isolated SQLite database, reviews generated SQL and records its SHA-256.
3. Apply the migration only to a disposable/fresh local database, then the local development database after backup/approval. Never apply it to D1/Turso/Production in this plan.
4. P101 gets the exclusive package lock. After handoff, run clean `npm ci`; only then branch P102/P103/P104 work against the frozen migration.
5. Root integrates P102 → P103 → P104, rerunning focused tests after each. P105 then updates configs/docs/CI without changing domain behavior.
6. P106 runs full local and clean-CI acceptance. Preview WAF/mail/runtime evidence is a separate approved Plan07/09 window.

## Local migration runbook

```text
preflight: git status --short; node init_brain.js <repo> --check
database: create a new temp SQLite file; never point commands at user progress DB
generate: prisma generate
apply: prisma migrate deploy against the temp file
verify: prisma migrate status + schema/row integrity tests
rollback rehearsal: discard the temp file only; production rollback is not inferred
```

The migration is forward-only. Because new client IDs are nullable for historical rows, rollback of application code is possible before any new-format writes. Once new writes exist, old code may read rows but cannot guarantee retry semantics; do not automatically roll back after write-enable without compatibility review.

## Tooling and CI contract (P105)

- Move the seed command from deprecated `package.json#prisma` to root `prisma.config.ts` using the installed Prisma 6 config API; keep schema/migration paths explicit. Remove the deprecated package field only after `validate`, `generate`, `migrate status`, E2E setup and seed-on-fresh-DB work.
- Make Vitest config ESM-safe (`vitest.config.mts` or an explicitly proven package module strategy) without converting the whole application module mode. Install the matching `@vitest/coverage-v8` and add `test:coverage`.
- Coverage thresholds are introduced from a recorded baseline and ratcheted, not guessed. Minimum first gate: no decrease in line/branch/function coverage for `src/core`, `src/server`, `src/lib`; all new P102–P104 files/functions require direct tests. Root may set numeric thresholds only after the first measured report is stored in acceptance evidence.
- Add `.github/workflows/ci.yml` with Node 24, `npm ci`, Prisma generate/validate, type-check, unit+coverage, lint, standard build, offline quality dry-run and isolated Playwright. Python 3.11 installs pinned runtime/test requirements and runs sidecar boundary tests without model warm-up.
- CI must not receive Turso/D1/Resend/Kira/OpenAI production secrets and must not reuse `.env`. Generated auth/provider values are test-only process variables.

## Documentation truth contract

P105 reconciles README, `.env.example`, ADR/gotchas and deploy files with code:

- Next/package/runtime versions come from lockfile/package, not copied historical claims.
- Provider unavailable is explicit; no runtime mock/fallback selector is documented.
- Cloudflare Worker+D1 is labelled historical rollback, Vercel/Turso is target, and hosted gates remain open.
- `render.yaml` and Compose PostgreSQL are either moved to an explicitly historical location in an approved separate change or marked unsupported/non-executable. Do not leave a runnable-looking production blueprint pointing SQLite Prisma at PostgreSQL.
- Kokoro client/model variables and prebuild instructions disappear from current runtime docs after P101; historical ADR text remains clearly historical.
- README test instructions distinguish `eval` that writes output from `eval:quality -- --dry-run` and protect `eval/report.md`.

## Preview procedure — external approval required

After all local/CI gates and only within Plan07/09:

1. Deploy to a disposable Turso clone with writes disabled; prove build/read/auth and fingerprint.
2. Publish the WAF rule in log mode, observe redacted counts, then enforce the fixed window.
3. Open a bounded write window and run only approved idempotency/ownership/mail scenarios.
4. Restore `MIGRATION_WRITE_MODE=disabled`; prove rejected write and unchanged fingerprint.
5. Restore/record firewall state. Do not promote the disposable clone or canonical staging DB.

## Forbidden zone

- CẤM run local acceptance against `dev.db` when the case writes or fault-injects; use a named temporary database.
- CẤM apply the Plan10 migration to Turso, D1 or Production from a worker handoff.
- CẤM run seed/reset/import against an existing learner database.
- CẤM commit generated secret files, provider output containing learner content, coverage HTML, Playwright artifacts or Python model/cache files.
- CẤM close a Preview/Production/rollback gate using local or CI evidence.

## Rollback

| Stage | Rollback |
|---|---|
| Package/config local | revert the bounded P101/P105 commit; regenerate lock/client; rerun baseline |
| Additive migration local before new writes | use disposable DB replacement; never edit/delete migration history |
| Application after migration/new writes | deploy prior compatible app only after checking nullable/new-table compatibility; retain new schema |
| Preview WAF | restore previous firewall version; verify normal auth and sensitive-path status |
| Preview app/clone | disable writes, discard only the named disposable clone after approval/evidence retention |
| Production | governed exclusively by Plan07 reconciliation-aware rollback; Plan10 cannot execute it |

## Operational errors

| Error | Required action |
|---|---|
| Dirty shared file overlaps worker patch | stop that package; root resolves ownership; no reset/checkout |
| Migration hash differs across handoffs | reject integration and regenerate from frozen schema |
| CI needs a real external secret | redesign test boundary; do not add secret |
| Python model downloads during boundary test | fail test setup; warm-up must remain disabled/mocked |
| Preview target identity uncertain | stop before any write; re-resolve exact project/database/deployment |
| Hosted state differs from plan | record evidence and return fence to disabled; do not improvise cutover |

## Completion evidence

Operations are complete only when command logs identify environment, database target class, commit, migration hash, test counts and redacted hosted outcomes. “Deploy succeeded” without target/write-mode/readback is not evidence.
