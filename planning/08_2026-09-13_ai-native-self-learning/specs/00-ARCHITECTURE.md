# P80 — Architecture and orchestration contract

Status: IMPLEMENTED LOCALLY. Read this → 01-CONTRACTS → relevant WP → OPERATIONS → TESTING-ACCEPTANCE. Preview/Production, Plan07 cutover/rollback, live AI and consented-pilot gates remain OPEN; this is not a release or plan closure.

## Goal and invariants

One self-learning loop: learner intent → server decision → Mission/Coach/Quest → response → contextual remediation → retry → owned evidence → next decision. AI produces bounded coaching; server controls ownership, persistence, state and grading rules. Existing LLM assessment is retained with provenance/confidence; it must not be presented as deterministic validation.

BẮT BUỘC extend existing `tutor-orchestrator`, `server/learning`, learner memory and calibration. `planNextLearningAction(userId: string, now: Date): Promise<LearningDecision>` is the shared application decision entry; it delegates grounded generation to the current provider boundary, not vice versa. Contract in 01; deterministic planning requires no live AI call.

BẮT BUỘC owner-filter data before planning; cite actual evidence. Separate unknown, provisional and calibrated estimates. Keep `clientTurnId`/event/completion fences intact when adding start idempotency. BẮT BUỘC preserve private-lesson ownership and published-curriculum eligibility at both read and execution time.

## Non-goals / vùng cấm

- CẤM rewrite stack, replace Turso with another database, introduce an agent framework or vector DB without a separate decision: review finds integration gaps, not a stack limitation.
- CẤM client-submitted score/CEFR, exposed validators, fake evidence, synthetic sessions, mock provider selectable in production.
- CẤM call deployment healthy because tests pass or typed AI unavailable renders; successful hosted AI is a distinct gate.
- CẤM expand to voice assessment or claim retention improvement without learner evidence; scope is text/listening self-learning loop already supported.

## Orchestrator handoff contract

Each WP returns `{wpId, baseCommit, changedFiles, contractRevision, commands:[{command,exitCode,environment}], artifacts, unresolvedRisks}`. Root checks actual diff and reruns cross-boundary tests; a narrative “done” is not acceptance. Shared schema, DTOs and `server/learning/service.ts` have one writer at a time. P82/P83 may run in parallel only after DTO freeze and exclusive file allocation. QA reviews runtime owner tests independently. No owner can close another environment's gate.

## Local implementation record (2026-09-13)

P80–P83 now use the existing server-owned learning paths: learner intent has a conditional memory write, the planner is a server read-only entry, Daily Quest receives a pinned `scenarioKey`, start requests have a durable ledger plus a one-PENDING-primary-start lease, and execution revalidates the target. P84 is an offline versioned quality suite only; P85 is a fresh isolated local acceptance run. The following result is **not** evidence that Vercel, Turso, a live provider, production or real learners exercised these paths.

## Errors and caller obligations

| Class | Required action |
|---|---|
| Ownership/resource invalid | 404 for another owner's private object; no explanation leaking existence; planner chooses eligible alternative only after fresh query |
| No evidence | Return calibration/default decision labeled as such, not “weak skill” |
| Provider unavailable | Preserve session/input; typed recoverable UX, never fake progress |
| Contract/file ownership conflict | Root halts overlapping edit, resolves spec revision before integration |
| Hosted gate incomplete | Release remains open; local work may continue without production writes |

## Evidence and acceptance

Local acceptance on 2026-09-13: `npm test` 387/387 across 78 files; type-check pass; lint exit 0 with 34 pre-existing warnings; Prisma validate/generate pass; production build pass; `npm run test:e2e` 20/20 in a newly created isolated SQLite sandbox; and offline quality evaluation 30/30 cases with 12/12 dataset checks. The P81 E2E fingerprints every application table before/after recommendation GET and found zero mutations. Independent local re-audit found no P0/P1. Full per-environment matrix, including the still-open hosted/pilot gates, is in TESTING-ACCEPTANCE.
