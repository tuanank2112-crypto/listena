# Testing and acceptance

## Required test matrix

| Area | Executable evidence | Required assertion |
|---|---|---|
| Quest history | service test + planner test | real create path passes owned valid recent keys; unused alternative selected; all-recent fallback valid |
| Completion integrity | service/route test | untouched session is not completed and profile minutes do not change |
| Partial debrief | service + Playwright | evidence-backed early exit is `PARTIAL` and UI does not show success trophy |
| Auto success | regression unit/E2E | successful BOSS still becomes `COMPLETED`, produces next action, and keeps success UI |
| Idempotency | service/route test | repeat completion never increments minutes twice |
| Mastery resolver | unit test | SkillMastery precedence, fallback and numeric clamping |
| Mastery UI | page integration/E2E | divergent profile/mastery displays current skill mastery |
| Existing loop | full suite/eval | Plan03 memory, intervention, next-action and timeline tests stay green |

## Exit gates

| Gate | Local | Server / production |
|---|---|---|
| Brain check | ✅ | N/A |
| Targeted P41–P43 tests | ✅ 29 tests / 7 files | N/A |
| `npm test` | ✅ 152 tests / 38 files | N/A |
| `npm run type-check` | ✅ | N/A |
| `npm run lint` (zero errors; warnings recorded) | ✅ 0 errors / 37 warnings | N/A |
| `npm run eval` (mock only) | ✅ 15/15 | N/A |
| `npx prisma validate` | ✅ | N/A |
| `npm run build` | ✅ Next.js 16.3.1 | N/A |
| isolated `npm run test:e2e` | ✅ 16/16, Chromium / fresh SQLite / mock tutor | N/A |
| Visual inspection of changed learner states | ✅ partial debrief asserted in Chromium | N/A |
| Production deployment/PG/live provider | DEFERRED | ⬜ deferred |

## Evidence rules

- A passing mock eval does not prove learning efficacy.
- E2E is PASS only after browser assertions run on the isolated database.
- Report counts, warnings and screenshots exactly after execution; do not copy Plan03 numbers as Plan04 evidence.

## Current baseline

Before Plan04 implementation, Plan03 recorded 139 tests in 34 files and 15 E2E tests. Plan04 final local evidence, 2026-09-10 (Asia/Saigon):

- `npx vitest run` for P41–P43 and reducer tests: 29 tests across 7 files PASS.
- `npm test`: 152 tests across 38 files PASS.
- `npm run type-check`: PASS.
- `npm run lint`: PASS with 0 errors / 37 pre-existing warnings.
- `npm run eval`: 15/15 deterministic mock cases PASS; this is not educational-efficacy evidence.
- `npx prisma validate`: PASS (existing Prisma 7 package-config deprecation warning).
- `pytest -q tts-service`: 3/3 PASS with 6 FastAPI deprecation warnings; no model warm-up/download.
- `npm run build`: PASS on Next.js 16.3.1.
- `npm run test:e2e`: 16/16 Chromium assertions PASS on a fresh isolated SQLite database with `AI_PROVIDER=mock`. The added case proved an untouched Mission receives 409 and preserves both active status and study minutes; manual evidence-backed stop visibly renders partial remediation, not a trophy.

Local exit gate: ✅. Production/deployment/real-provider/real-efficacy gates: deferred.
