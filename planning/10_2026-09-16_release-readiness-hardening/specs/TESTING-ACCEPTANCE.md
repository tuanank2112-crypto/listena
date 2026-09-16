# Testing and acceptance — Plan10

## Fresh baseline (review only)

| Check | 2026-09-16 result |
|---|---|
| Brain boot | ✅ engine 1.7.2/template 1.4.0 compliant |
| Unit | ✅ 425/425, 87 files |
| Type-check | ✅ |
| Lint | ✅ exit 0; 33 warnings |
| Next production build | ✅ 42 pages/routes generated; 31 API route files in source inventory |
| Prisma | ✅ validate; 8 migrations; local schema up to date; deprecated config warning remains |
| E2E | ✅ 20/20, isolated fresh SQLite |
| Offline quality | ✅ 30/30 cases; 12/12 dataset checks, dry-run |
| Python sidecar | ⚠️ not executed: host lacks `fastapi`; collection stopped before tests |
| Dependency audit | ❌ 8 high / 0 critical; runtime and toolchain paths require P101 |

This table is input evidence, not Plan10 implementation acceptance.

## Test matrix

| Gate | Local fresh SQLite | CI | Disposable Preview | Production |
|---|---:|---:|---:|---:|
| Additive migration + old-row compatibility | ⬜ | ⬜ | ⬜ Plan07 window | ⬜ Plan07 |
| Attempt idempotency/atomic fault matrix | ⬜ | ⬜ | ⬜ bounded | ⬜ |
| Flashcard concurrent schedule/replay | ⬜ | ⬜ | ⬜ bounded | ⬜ |
| Manual/AI lesson ledger + graph atomicity | ⬜ | ⬜ | ⬜ bounded provider | ⬜ |
| Ownership and validator secrecy | ⬜ | ⬜ | ⬜ | ⬜ |
| Production dependency high/critical | ⬜ zero or approved non-runtime exception | ⬜ | artifact scan ⬜ | artifact scan ⬜ |
| Vitest/Prisma warning remediation | ⬜ | ⬜ | n/a | n/a |
| Python TTS boundary, no model download | ⬜ | ⬜ | optional configured target ⬜ | ⬜ |
| Opaque errors + secret canaries | ⬜ | ⬜ | ⬜ logs | ⬜ logs |
| WAF sensitive-path limit/rollback | n/a | n/a | ⬜ | ⬜ |
| Existing unit/type/lint/build/E2E/quality | ⬜ | ⬜ | build/read smoke ⬜ | ⬜ |
| Plan09 real mail | n/a | n/a | ⬜ Plan09 | ⬜ Plan09 |
| Live provider/efficacy | offline only | offline only | ⬜ separate | ⬜ / pilot |

## Mandatory cases

1. Same attempt ID/body replayed sequentially and concurrently: one Attempt, exact errors, one set of flashcards, one profile/minute update and one set of mastery deltas.
2. Same attempt ID with one changed accepted field: 409 and zero new state/provider call.
3. Failure injected at every core attempt batch statement: zero rows/deltas from that intent; retry same ID commits once.
4. Open-response provider unavailable after core commit: deterministic assessment survives; exact replay does not duplicate core state.
5. Same flashcard review ID replay: one ReviewLog and one schedule/counter change. Two distinct concurrent IDs cannot both apply from the same prior schedule.
6. Foreign flashcard/lesson/course request does not expose existence/content and changes no state.
7. Manual lesson graph failure at each statement leaves no Lesson/segment/exercise/join/request committed as success.
8. AI lesson exact replay invokes provider at most once; uncertain post-provider failure becomes UNKNOWN and does not auto-call again.
9. Publish rejects graph missing any segment, exercise or target vocabulary; no historical DRAFT is auto-published/fixed.
10. Logs/responses exclude seeded secret/token/answer/question/feedback/URL canaries under validation, DB, provider and sidecar failures.
11. TTS rejects non-1 speed until real support is proven, applies matching bounds at both services, serves cached audio privately and never returns exception text.
12. Fresh `npm ci` and Python 3.11 dependency install reproduce all gates without real external secrets or model downloads.
13. README/env/deploy assertions are tested against package/runtime config; unsupported Render/Postgres paths cannot be mistaken for the active target.
14. Preview WAF log then enforcement returns 429 only after threshold and normal bounded auth/account flow remains usable; rollback restores previous firewall version.

## Acceptance thresholds

- P0/P1 open in Plan10 local scope: **0**.
- Unit/E2E regressions: **0**; all pre-existing 425 unit and 20 E2E scenarios still pass, plus new cases.
- Lint: **0 errors** and warning count must not exceed baseline 33; files changed by a WP add no new warnings. P105 should remove relevant warnings but broad unrelated cleanup is not a release blocker.
- Coverage: measured and non-decreasing for core/server/lib; all new behavior has branch coverage. Numeric repo thresholds are set only from first reproducible baseline.
- Dependency: **0 critical**; **0 high reachable in Vercel runtime**. Build/rollback exceptions require complete dated disposition and cannot be indefinite.
- Database: exact row/counter/readback invariants; `foreign_key_check` empty and `integrity_check=ok` for SQLite fixtures.
- Secrets/content: zero canary occurrence in tracked output, response bodies and captured logs.

## Post-merge CI acceptance evidence — 2026-09-16

- The first hosted GitHub Actions executions exposed two CI-only integration defects that local acceptance had not exercised: npm 11 rejected the lockfile because `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3` were absent from the resolved lock graph, and the job-level `MIGRATION_WRITE_MODE=disabled` propagated into Playwright's isolated local server, making mutation routes return the intended fenced 503 response.
- The lockfile was regenerated by npm 11 on Node 24 in a clean GitHub runner; it was not hand-edited. A clean `npm ci` then passed.
- `playwright.config.ts` now forces `MIGRATION_WRITE_MODE=enabled` only after creating its guarded temporary SQLite path. `e2e/setup.ts` still refuses to seed any database outside that temp directory, so this does not weaken Vercel/Preview/Production write fencing.
- GitHub Actions run `35060225165` for commit `9a48793` completed successfully end-to-end: dependency installs, Prisma validate/generate, type-check, lint, Vitest coverage (437/437 tests), Python TTS tests (7/7), Next production build, offline quality (30/30 cases and 12/12 checks), browser install, and isolated Playwright E2E (20/20).

## Forbidden zone

- CẤM weaken assertions, skip failing suites, reuse an existing dev server/database, or lower a measured coverage threshold merely to make the gate green.
- CẤM allow test-only provider selection, transport stubs, auth secrets or fixture verification flags to become selectable in a production runtime.
- CẤM write `eval/report.md` during acceptance while it contains user changes; use versioned run artifacts or dry-run.
- CẤM interpret advisory count, typed unavailability, WAF configuration presence or test snapshots as real provider/mail/efficacy proof.

## Exit gates

- ✅ local contracts — migration reviewed, P101–P104 focused tests pass.
- ✅ local full — unit (437/437), type-check (0 err), lint (0 err, 33 warn), build (42 routes), Prisma (validate/status 9 migrations clean), E2E (20/20), quality (30/30, 12/12), Python pytest (7/7), coverage all pass with recorded counts.
- ✅ CI — GitHub Actions Node 24/Python 3.11 run `35060225165` passed the complete clean pipeline without production secrets, including `npm ci`, coverage, build, quality and isolated E2E 20/20.
- ✅ Preview disabled — Vercel Preview deployment Ready (`dpl_J7mpqTPdmbqTrqHi9xoZeeQQdGsS`), `APP_RUNTIME=vercel`, writes fenced with `MIGRATION_WRITE_MODE=disabled`, Turso preview & staging schemas reconciled with migrations 8 & 9, `integrity_check=ok`, `foreign_key_check=0`, all 31 tables & 56 indexes verified.
- ⬜ Preview enabled — separately approved clone proves Plan10 idempotency/ownership, Plan09 mail and WAF behavior; fence restored.
- ⬜ server disabled — final Plan07 export/target/build/read gates, no public writes.
- ⬜ server enabled — separate explicit approval; first writes/readbacks/provider/mail/WAF evidence passes.
- ⬜ rollback — Cloudflare/data reconciliation and firewall rollback evidence recorded under Plan07.
- ⬜ pilot — consented learner evidence; no efficacy claim before this gate.

Plan10 may be marked local-complete only through the CI gate. It cannot be closed as a release while any required hosted/rollback gate for the target remains open.

## Failure acceptance rules

No unit test substitutes for concurrent database readback; no local test substitutes for hosted WAF/mail/provider; no dependency version string substitutes for resolved-tree audit; no Worker report substitutes for root diff/integration review. An environment gate may only be checked by evidence from that environment.
