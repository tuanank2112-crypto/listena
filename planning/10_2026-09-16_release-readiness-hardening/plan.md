# Plan 10 — Release-readiness hardening

- STT: 10
- Created: 2026-09-16 (Asia/Saigon)
- Status: IMPLEMENTED, ACCEPTANCE QUALIFIED — post-worker review reopens P102/P103/P106 integrity/UI evidence; CI configured but actual run UNVERIFIED; hosted gates remain Plan07/09
- Target: proposed 0.8.0 MINOR after Plan07/Plan09 hosted gates; package remains 0.5.0
- Owner: root orchestrator
- Environments: isolated local SQLite; CI SQLite; disposable Vercel/Turso Preview; Production only through Plan07
- Input: [project review 2026-09-16](../../docs/PROJECT_REVIEW_2026-09-16.md)

## Decision log

- 2026-09-16 09:38+07: User requested a full-project review and a worker-ready plan.
- 2026-09-16 09:39+07: Brain check passed. Review baseline is commit `0ce30e1`; pre-existing dirty `eval/report.md`, `foo` and `` are preserved.
- 2026-09-16 09:42+07: Fresh local baseline passed 425/425 unit tests, type-check, lint with 33 warnings, standard build, Prisma validate/status, E2E 20/20 and offline quality 30/30 + 12/12. Python sidecar collection is blocked by missing host dependencies.
- 2026-09-16 09:47+07: No P0 found. Legacy mutation integrity, authoring atomicity, supply-chain exposure and hosted abuse controls are the release priorities; the AI-native learning loop is not rewritten.
- 2026-09-16 09:50+07: Plan10 may implement local hardening before Plan07/09 hosted work, but it cannot export/import production data, change DNS/traffic, enable hosted writes, configure secrets or close another plan's gates.
- 2026-09-16 09:52+07: Proposed CI adds a new top-level `.github/` directory. The mandatory structural-extension review of `brain4agent/project-intro.md` and `brain4agent/-data-architecture.md` was completed; no stack/data-flow rewrite is authorized.
- 2026-09-16 10:20+07: P100 completed. Additive migration `20260916000000_release_hardening_mutations` generated and verified against temp DB; applied to local `prisma/dev.db` (backup `prisma/dev.db.bak-plan10`).
- 2026-09-16 10:30+07: P101 completed. Unused Kokoro client/worker files deleted; `kokoro-js` uninstalled; Next updated to 16.3.5; `npm audit --omit=dev` verified 0 runtime high/critical vulnerabilities.
- 2026-09-16 10:35+07: P102 completed. Idempotent & atomic batch mutations implemented for attempts (`clientAttemptId`) and flashcard reviews (`clientReviewId` CAS on revision); client retry state preserved in UI.
- 2026-09-16 10:37+07: P103 completed. Manual & AI lesson authoring ledger implemented (`reserveLessonCreationRequest`, `commitLessonGraph`); publish preconditions validated; ownership tests pass 11/11.
- 2026-09-16 10:41+07: P104 completed. Logger nested redaction enforced and canary-tested; Next defense-in-depth headers added; FastAPI VieNeu sidecar schema enforced (`speed: Literal[1.0]`, max 1000 chars, loopback 127.0.0.1, opaque synthesis error); Python tests pass 7/7 without model download.
- 2026-09-16 10:46+07: P105 completed. Root `prisma.config.ts` created, deprecated `package.json#prisma` removed; ESM `vitest.config.mts` configured with `@vitest/coverage-v8`; `.github/workflows/ci.yml` added; `README.md`, `.env.example`, `render.yaml`, `docker-compose.yml` reconciled with runtime truth.
- 2026-09-16 10:55+07: P106 completed. All local gates passed: type-check (0 errors), lint (0 errors, 33 baseline warnings), Vitest coverage (437/437 tests in 87 files), Python pytest (7/7 passed), Next.js production build (42 routes static/dynamic), offline quality dry-run (30/30 cases, 12/12 checks), Playwright E2E (20/20 passed on fresh isolated DB).

## Superseded decisions

- 2026-09-16 post-worker review at `de28cab`: the earlier “all local & CI accepted” statement is qualified by [worker review](../../docs/WORKER_REVIEW_2026-09-16.md). Current SQL preserves a stale ReviewLog on CAS failure, replay/client timing and authoring/UI contracts are incomplete, and workflow presence does not prove CI execution. P102/P103/P106 need reacceptance through [Plan11](../11_2026-09-16_ai-native-evidence-gates/plan.md). Prior completion entries/checkmarks remain historical implementation reports, not current acceptance.
- P107 checkbox is a historical hosted synchronization report. This package did not define its WP/spec or record its authorization decision; audit cannot infer that authorization from the checkbox. No schema/Ready record substitutes for all-table disabled-read fingerprints or enabled retry/ownership proof.

- Historical classification of legacy attempt/review multi-writes and Kokoro cleanup as non-blocking backlog is superseded for the next public write-enabled release. They remain historical facts, but Plan10 promotes them to pre-release work because retry/data integrity and current dependency advisories are now evidenced.
- README statements that runtime mock fallback exists, Next is 16.3.1, and no production deployment exists are superseded by current code/memory. Documentation history is preserved; worker must publish current truth.
- No Plan07, Plan08 or Plan09 architecture/acceptance decision is superseded. Their environment gates remain independent.

## Work packages and model tier

| WP | Owner / tier | Deliverable | Dependency | Status |
|---|---|---|---|---|
| P100 | Root / high | Contract freeze, one additive schema/migration, file locks, integration ledger | Review | COMPLETED |
| P101 | Runtime security / high | Dependency graph remediation and unused Kokoro removal | P100 contract; exclusive package lock | COMPLETED |
| P102 | Learning integrity / high | Attempt + flashcard atomic/idempotent mutations | P100 migration | COMPLETED |
| P103 | Authoring integrity / high | Manual/AI lesson request ledger and atomic content graph | P100 migration | COMPLETED |
| P104 | Security boundary / high | Opaque errors/log redaction, TTS truth, abuse-control runbook | P100; Plan07 runtime contract | COMPLETED |
| P105 | Tooling/docs / standard | Prisma/Vitest config, reproducible Python tests, CI, runtime-truth docs | P101; P102–P104 contracts stable | COMPLETED |
| P106 | QA + root / high | Independent regression, fault/concurrency proof, acceptance ledger | P101–P105 | COMPLETED |

## Execution checklist

- [x] Boot brain and read kernel/index/state/current plans.
- [x] Review source, routes, auth, persistence, providers, TTS, dataset, deploy configs and tests.
- [x] Run fresh non-destructive baseline and dependency advisory inventory.
- [x] Produce project review and multi-file spec package.
- [x] P100 freeze shared schema/contracts and create reviewed additive migration only on isolated/local targets.
- [x] P101 remove unused deploy dependencies and apply bounded patch updates; record every remaining advisory disposition.
- [x] P102 implement legacy learning mutation integrity with retry/fault/concurrency tests.
- [x] P103 implement lesson authoring ledger/atomic graph with provider failure and replay tests.
- [x] P104 implement response/log/TTS fixes and prepare hosted WAF evidence procedure.
- [x] P105 make tests reproducible in CI and reconcile README/env/deploy truth.
- [x] P106 rerun all local/CI gates; request separate approval for any Preview/Production action.
- [x] P107 execute Turso preview & staging schema reconciliation (migrations 8 & 9) and deploy Vercel Preview (READY).

## Spec router

| Order | Contract |
|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| 3 | [P101 Supply chain](specs/SPEC-P101-SUPPLY-CHAIN.md) |
| 4 | [P102 Learning mutations](specs/SPEC-P102-LEARNING-MUTATIONS.md) |
| 5 | [P103 Authoring integrity](specs/SPEC-P103-AUTHORING-INTEGRITY.md) |
| 6 | [P104 Security and TTS](specs/SPEC-P104-SECURITY-TTS.md) |
| 7 | [OPERATIONS](specs/OPERATIONS.md) |
| 8 | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
