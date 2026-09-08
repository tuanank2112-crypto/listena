# Checkpoint — completed local acceptance

## State
Plan 03 is complete for its local acceptance scope. Existing user changes remain intact; nothing committed or deployed. All verification used a fresh isolated SQLite database for E2E; no user database was reset, seeded, or migrated.

## Changes present, not fully accepted
- W1: src/server/learner-memory/repository.ts validates JSON entries and appends exact evidence using the caller transaction; lastEvidenceId is also stored on skill aggregates, and goals/preferences are not rewritten on update. src/server/learning/service.ts writes memory inside evidence/mastery transaction and passes typed memory into tutor context at create/turn time. tutor-grounding bounds the context. Unit tests and e2e/memory-consistency.spec.ts exist; E2E has not run.
- W2: next-action.ts checks owned evidence, cross-session recurring errors, published/unlearned skill-related Coach targets, due-word Quest, and a different valid mission scenario. Root fixed incomplete syntax and typed Prisma filters. Completed GET/turn/complete API envelopes include nextAction via API helper; reducer/player retain and render it. PRACTICE starts an existing Mission with corrective goal (avoids an empty unrelated flashcard queue). Recommendation unit/route tests and auto/manual/reload/CTA E2E are still missing.
- W3: shared timeline service, validated API window, dashboard/progress consumers, complete seven-day time aggregate separate from latest-50 display queries. Removed hard-coded course-title filters in dashboard/games/lessons. Progress endpoint uses shared weekly aggregate and includes never-reviewed cards in due count. Timeline score scale fixed by kind. No dedicated timeline unit/API/E2E tests yet.
- W4: TTS API auth, body validation, required shared secret, bounded sidecar fetch timeouts, runtime voice resolution, private response headers, new cache default tts-service/cache/proxy via TTS_PROXY_CACHE_DIR. VieNeu client permits absent voice so server resolves it. Python sidecar checks X-TTS-Key and fails closed; Docker passes key and binds port to 127.0.0.1. No TTS tests have been added/run. Existing previously generated public audio has not been removed. Sidecar speed semantics remain unverified/unchanged.
- Metadata: package.json and package-lock root versions aligned to 0.2.1; Plan 03 spec package and review document added; brain index/roadmap point to current work. Broader README/old-plan/status sync is unfinished.

## Executed checks (do not overstate)
- Boot engine --check: PASS, twice during survey/current work.
- Baseline npm test: 106/106, 27 files; npm run type-check PASS; npm run lint 0 errors / 38 warnings.
- npx prisma validate: PASS (existing package.json Prisma config deprecation warning).
- Integration npm test after agent stop: 111/111, 28 files. At that moment type-check found two syntax errors in next-action.ts; tests did not cover that module. Root fixed these errors afterward.
- Latest npm run type-check: PASS after syntax/integration/TTS edits.
- Full unit suite has NOT been rerun after final root changes; lint/build/eval/E2E/Python sidecar tests/migrations have NOT been run on final state.

## Resume verification 2026-09-08
- `npm test`: 138/138 passed across 34 files.
- `npm run type-check`: PASS.
- `npm run lint`: 0 errors / 37 warnings.
- `npm run eval`: 15/15 mock orchestration cases passed.
- `npx prisma validate`: PASS with the existing Prisma 7 config deprecation warning.
- `npm run build`: PASS on Next 16.3.1.
- `npm run test:e2e`: BLOCKED by environment: Playwright Chromium fails with `browserType.launch: spawn EPERM`; no application assertion was reached.
- Dedicated tests: 21/21 TypeScript memory/TTS/learning tests PASS; 3/3 Python sidecar boundary tests PASS with temporary cache and no model warm-up.
- Chromium investigation: Playwright reports `browserType.launch: spawn EPERM` before assertions; the installed Chrome executable exists, direct headless launch works, and a plain Node `spawn` works. This isolates the blocker to the Playwright launch path or execution policy, not missing browser binaries or application assertions.

## Final verification 2026-09-08

- The prior EPERM investigation was superseded by the full run below. The decisive webserver failure was an existing Next dev server (PID 24896) holding the repository's dev lock; stopping that process allowed Playwright Chromium to launch normally.
- `npm test`: 139/139 passed across 34 files.
- `npm run type-check`: PASS.
- `npm run lint`: PASS with 0 errors / 37 existing warnings.
- `npm run eval`: 15/15 deterministic mock cases passed.
- `npx prisma validate`: PASS.
- `npm run build`: PASS on Next.js 16.3.1.
- `pytest -q tts-service`: 3/3 passed with a temporary cache directory and no model warm-up.
- `npm run test:e2e`: 15/15 passed against a fresh isolated SQLite DB with migrations applied and AI_PROVIDER=mock.
- Screenshots for manual/auto debrief and dashboard/progress were generated and inspected. Auto completion intentionally produced a PRACTICE CTA because one successful BOSS turn left communication mastery at 0.556, below the 0.6 threshold.

## Next steps, in order
1. Read Plan 03/specs, this checkpoint and source. Run brain --check. Preserve all existing dirty files. No fresh feature clarification needed: user authorized autonomous completion.
2. Review W1/W2/W3/W4 diffs and root fixes; inspect remaining recommendation semantics (Quest target vocabulary, Coach fit, corrective goal), error paths, private DTO and timestamp rendering. Finish regression tests below before accepting code.
3. Add unit tests for next-action branches/no evidence/owned cross-session errors/unavailable targets/learned lessons, and completed-envelope failure isolation. Add timeline tests for >50 sessions, 7d vs 30d, future/old exclusions, ownership, empty data and invalid window.
4. Add TTS route tests mocking auth/fetch/fs (unauthenticated no work; missing secret503; invalid body400; missing voice resolved; private caching; sidecar failures). Add Python model-free request tests with temporary cache directory; do not invoke warmup/download. python on PATH has fastapi/numpy/httpx/pytest installed. Main module creates cache directory at import, so set TTS_CACHE_DIR to temp first.
5. Add isolated E2E for manual+automatic completion, reload nextAction, click through to new owned session, timeline all four kinds and renamed published course visibility with DRAFT exclusion. Use unique test learners; all specs share one temporary DB, workers1. Existing memory E2E has a rollback trigger, dropped in finally.
6. Run npm test, npm run type-check, npm run lint, npm run eval, npx prisma validate, npm run build, npm run test:e2e. Existing e2e/setup.ts applies all migrations to fresh temp DB. Never run db:reset/seed against dev.db. Do not run build and E2E against .next simultaneously. No repo Next dev server was observed at last process/lock check, but recheck before starting.
7. Inspect E2E screenshots for debrief/dashboard/progress if produced; verify actual memory evidence and retry counts in SQLite. Fix failures and rerun affected checks.
8. Update exact signatures and changed PRACTICE navigation in Plan03 specs; record final command evidence. Synchronize docs/learning.md, README (stale Kokoro/auth statements), earlier plans, kernel/index/roadmap/changelog/hot memory/state. Close only actual local gates.

## Deferred / boundaries
Production Render uses PostgreSQL while current Prisma/migrations use SQLite. Do not deploy. Real AI pedagogical effectiveness, live VieNeu inference/voice speed, quotas/latency, broader legacy attempt/review transaction audit and existing lint cleanup remain separate work. No new DB schema migration is required by changes so far.
