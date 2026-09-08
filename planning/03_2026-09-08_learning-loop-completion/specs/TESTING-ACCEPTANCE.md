# Testing and acceptance

## Contract
Acceptance requires executable assertions across turn → server grading → exact evidence → mastery + memory commit → next action → UI → next activity, plus shared timeline visibility. All database mutation tests use a fresh temporary SQLite database.

## MUST / MUST NOT
- MUST test failed memory write rolls back a real turn transaction and duplicate requests do not increment memory twice.
- MUST test missing/malformed memory and missing recommendation target without leaking private answers.
- MUST verify next action after manual completion, automatic completion and reload, and real CTA navigation.
- MUST verify timeline ownership, empty state, invalid window, all four item kinds, >50-session totals and seven-day bounds.
- MUST verify renamed/new published course remains visible and DRAFT remains hidden.
- MUST test TTS authentication without downloading a model or sending private text to external services.
- MUST NOT equate deterministic mock eval success with real educational efficacy.

## Error matrix
| Outcome | Acceptance behavior |
|---|---|
| Failed required assertion | Gate remains open; fix then rerun |
| Environmental external-service limitation | Document exact limitation; no fabricated PASS |
| Existing warning unrelated to scope | Record count, defer broad cleanup |

## Evidence
| Gate | Baseline | Final local |
|---|---|---|
| Brain --check | PASS 2026-09-08 | PASS |
| Unit tests | 106/106, 27 files | PASS 139/139, 34 files |
| Type-check | PASS | PASS |
| Lint | 0 errors / 38 warnings | PASS 0 errors / 37 warnings |
| Prisma schema + isolated migrations | Not rerun this turn | Schema validate PASS; isolated E2E setup applied migrations to fresh SQLite DB |
| Mock pedagogical eval | Historical 15/15 only | PASS 15/15; mock only |
| Production build | Not rerun this turn | PASS |
| Isolated E2E | Historical 7/7 only | PASS 15/15 (Chromium, one worker, fresh SQLite DB, AI_PROVIDER=mock) |

Dedicated suites: TypeScript memory/TTS/learning route tests 21/21 PASS; Python sidecar boundary tests 3/3 PASS (temporary cache, no model warm-up/download). Local exit gate: ✅ local. Production deployment: DEFERRED, not an acceptance claim.

Final execution evidence, 2026-09-08 (Asia/Saigon):

- `npm test` — 139/139 passed across 34 files.
- `npm run type-check` — PASS.
- `npm run lint` — PASS with 0 errors / 37 existing warnings; broad warning cleanup remains out of scope.
- `npm run eval` — PASS 15/15 with the deterministic mock orchestrator. This is not evidence of real pedagogical effectiveness.
- `npx prisma validate` — PASS; existing Prisma 7 `package.json#prisma` deprecation warning remains.
- `npm run build` — PASS on Next.js 16.3.1.
- `pytest -q tts-service` with a temporary `TTS_CACHE_DIR` — 3/3 PASS, 6 deprecation warnings.
- `npm run test:e2e` — 15/15 PASS. The earlier `browserType.launch: spawn EPERM` report was superseded after confirming no Playwright launch-path environment block; the first failed full run was instead caused by an existing Next dev server PID 24896 in this repository. That server was stopped, and all 15 tests then reached real browser assertions.
- Debrief/dashboard/progress screenshots were produced under `test-results/`; the auto-completion debrief was visually checked and shows the grounded `PRACTICE` CTA after the first successful turn left communication mastery below 0.6. This is intentional remediation behavior, not a recommendation failure.
