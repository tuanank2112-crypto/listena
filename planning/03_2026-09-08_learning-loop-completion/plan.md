# Plan 03 — Complete the existing AI-native learning loop

- STT: 03
- Status: COMPLETED LOCAL — all local acceptance gates passed; production/deployment deferred
- Started: 2026-09-08 (Asia/Saigon)
- Target: 0.2.1 PATCH (complete existing 0.2 contracts)
- Acceptance environment: local; production infrastructure remains deferred.

## Decision log
- 2026-09-08: User explicitly authorized autonomous completion of unfinished repository features, Terra High implementation agents, integration and verification.
- 2026-09-08: Source audit found P11 nextAction discarded by UI, P12 timeline without UI consumers, memory writes outside evidence transaction, title-bound curriculum queries, and unauthenticated TTS endpoints. FIX NOW: these concrete gaps. DEFERRED: PostgreSQL deployment, real-provider pedagogical outcomes, broad lint cleanup. INTENTIONAL: deterministic recommendation, SQLite, server grading, isolated E2E data.
- 2026-09-08: Preserve existing working changes. Implement without database resets or speculative architectural rewrites. Read local Next.js guides before framework edits.
- Superseded decisions: Plan 02's best-effort/last-write-wins memory persistence is superseded by transactional persistence for new turns. Prior completion claims for P11/P12 are not accepted as implementation evidence.
- 2026-09-08: All three Terra High agents hit account usage limits before completion. Root reviewed their partial code, fixed next-action syntax/integration issues, and implemented TTS request protection. This is an explicit execution deviation; do not claim all final coding was completed by Terra agents.
- 2026-09-08: User requested stopping near usage limits and reporting completed/remaining work. Paused with source changes retained, no commit/deployment, no real learner DB mutation. Resume from docs/LEARNING_LOOP_CHECKPOINT_2026-09-08.md.
- 2026-09-08 (resume): User requested managing subagents through the plan with Terra High as principal coding agents. Usage tool reports 26% of five-hour quota used and 4% weekly used. Resume three disjoint agent packages: next action; timeline/curriculum; memory review plus TTS. Root owns review, combined verification, docs. Preserve earlier request to checkpoint before exhausting quota.
- 2026-09-08 (final): Root completed integration and verification locally. A stale Next dev server in this repository, not Playwright binary availability, caused the earlier webserver failure; after stopping it, all 15 E2E tests ran. Auto-completion intentionally recommends PRACTICE when the first successful BOSS turn leaves communication mastery below 0.6. The deterministic mock was corrected to honor a successful BOSS turn (`shouldComplete`, DEBRIEF patch), with a regression test. No commit/deploy, real-provider efficacy, production DB/TTS latency, quota, or real voice-speed claims.

## Work packages
| Task | Objective / why | Owner / model | Files | Dependencies / parallelism | Acceptance / verification |
|---|---|---|---|---|---|
| W1 | Bind memory to exact committed evidence; preserve validated context | backend_survey / gpt-5.6-terra high | server/learner-memory, learning/service and tests, AI context if needed | Parallel W2/W3; coordinate exported memory types | Exact evidence, retries once, rollback, corrupt-memory tests |
| W2 | Ground next action and finish debrief-to-activity flow | ui_survey / gpt-5.6-terra high | learning/next-action, learning-session API routes, features/learning-session, session-player, own tests/E2E | Parallel W1/W3; no service.ts edits | All recommendation branches, valid targets, auto/manual/reloaded completion CTA |
| W3 | Share timeline aggregation and connect learner views; remove course-name dependence | timeline / gpt-5.6-terra high | timeline service/types/API, dashboard/progress/games/lessons lists, own tests/E2E | Parallel W1/W2 | Four item kinds, uncapped 7-day total, invalid window, renamed course visibility |
| W4 | Protect TTS request boundaries | Terra High agent after W1–W3 slot | app/api/tts/vie, tts-service, Docker/env/docs and tests | Separate files; after scope review | Unauthenticated requests rejected; sidecar secret checked; existing speech fallback preserved |
| W5 | Integration, review, evidence and documentation | root; fixes delegated to Terra High | planning, docs, brain, version metadata | After implementation | Unit, types, lint, eval, build, Prisma validation/migrations and isolated E2E |

## Checklist
- [x] Inspect architecture, current diffs, specs and baseline.
- [x] Establish contracts, ownership and verification plan before implementation.
- [x] W1 memory consistency.
- [x] W2 next action and learner navigation.
- [x] W3 timeline and curriculum integration.
- [x] W4 TTS request boundaries.
- [x] W5 integration review, regression checks, docs and memory synchronization.

## Spec router
- [Architecture](specs/00-ARCHITECTURE.md)
- [Contracts](specs/01-CONTRACTS.md)
- [Operations](specs/OPERATIONS.md)
- [Acceptance](specs/TESTING-ACCEPTANCE.md)
