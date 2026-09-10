# Plan 04 — Learning integrity and mastery truth

- STT: 04
- Status: COMPLETED LOCAL — all local acceptance gates passed; production/deployment remains deferred
- Started: 2026-09-10 (Asia/Saigon)
- Target: 0.3.0 MINOR
- Acceptance environment: local, isolated SQLite E2E database, deterministic tutor provider.

## Decision log

- 2026-09-10: A post-Plan03 source audit confirmed three connected P1 gaps: `DAILY_QUEST` history is not passed through the real start path; an untouched session can be manually completed and receive study time; the learner-facing mastery meters use profile columns while AI sessions update `SkillMastery`. FIX NOW as one integrity-and-truth package.
- 2026-09-10: Preserve the learner's ability to end a started session early, but call it a partial practice stop rather than successful mission completion. A server-owned learner-evidence precondition prevents zero-work completion.
- 2026-09-10: Keep `nextAction` recomputation, Plan03 memory transaction, authored mission templates, SQLite provider and legacy attempt/review/game flows unchanged. Generalizing evidence beyond `LearningSession` needs a new source contract and schema migration, so it is explicitly deferred.
- 2026-09-10: Public self-registration of `TEACHER`, client-asserted game correctness, Compose/PostgreSQL exposure and legacy provider timeout are recorded findings but not in this package: their correct fixes require security/product or operations scope distinct from this focused learning-loop increment.
- 2026-09-10 (final): Terra High implemented P41/P42/P43 in separate file areas. Root corrected the P42 race regression so it reaches the intended post-evidence transition, added an HTTP/browser regression for zero-evidence completion, reviewed the combined diff, and ran every local gate. No schema migration, deploy, user DB reset, or production claim.

## Superseded decisions

- None. Plan03 local acceptance remains valid; this plan adds regressions without weakening any prior contract.

## Work packages

| Package | Owner / model | Scope | Dependency | Acceptance |
|---|---|---|---|---|
| P41 Quest history | Terra High | real start-path history → planner | none | newest Daily Quest avoids a recent scenario when an alternative exists; deterministic fallback remains valid |
| P42 Completion integrity | Terra High | service/API/debrief semantics and tests | none | untouched sessions remain active/no minutes; started partial sessions remain usable but are truthfully represented; successful BOSS flow remains complete |
| P43 Mastery truth | Terra High | shared server DTO plus learner dashboard/progress and tests | P42 contract review only | meters use current `SkillMastery`, profile fallback only for unseen skills; no client DB imports |
| P44 Integration / evidence | Astra | review, E2E, local gates and project knowledge | P41–P43 | all local exit gates recorded with actual command evidence |

## Execution checklist

- [x] Verify brain boot, kernel/index, Plan03 and recent session prompt.
- [x] Reconstruct code paths and classify audit candidates.
- [x] Create full spec package before implementation.
- [x] P41 implementation and targeted tests.
- [x] P42 implementation and targeted tests.
- [x] P43 implementation and targeted tests.
- [x] Review combined diff and run local acceptance matrix.
- [x] Synchronize checkpoint, learning docs, roadmap/changelog and hot state after real verification.

## Spec router

| Contract | Specification |
|---|---|
| Architecture, scope and forbidden zones | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| API/module/type contracts | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| Work-package implementation detail | [P41 quest history](specs/SPEC-P41-QUEST-HISTORY.md), [P42 completion truth](specs/SPEC-P42-COMPLETION-TRUTH.md), [P43 mastery truth](specs/SPEC-P43-MASTERY-TRUTH.md) |
| Run / rollback procedure | [OPERATIONS](specs/OPERATIONS.md) |
| Test matrix and exit gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
