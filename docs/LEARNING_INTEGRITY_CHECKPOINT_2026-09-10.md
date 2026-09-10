# Checkpoint — Plan 04 completed local acceptance

## State

Plan 04 is complete for local acceptance. No production data, local learner DB, Prisma schema/migration, deployment, or secrets were changed. `eval/report.md` remained a pre-existing dirty generated report and is not Plan04 implementation evidence.

## What changed

- Daily Quest now supplies up to three recent owned validated scenario keys to the existing planner. Recent alternatives are avoided when possible; malformed historical JSON is ignored.
- Completion now requires persisted session evidence. Direct completion of an untouched session returns the normal domain conflict and does not write completion state or study minutes. Evidence-backed manual stops persist a `PARTIAL` outcome in the existing state JSON; automatic BOSS success persists `COMPLETED`.
- Debrief renders partial remediation without a trophy and preserves the success treatment for actual completion. Older completed state defaults conservatively to partial unless it contains the historical DEBRIEF marker.
- Dashboard/progress meters resolve adaptive `SkillMastery` first, then legacy profile data, then 0.5. No competing profile write was added.

## Verification

- 29 targeted tests / 7 files PASS.
- `npm test`: 152/152 in 38 files PASS.
- type-check PASS; lint 0 errors / 37 warnings; mock eval 15/15; Prisma validate PASS; Next build PASS.
- Python TTS boundary suite 3/3 PASS (6 existing FastAPI deprecation warnings; no model download).
- Playwright 16/16 PASS on a fresh isolated SQLite database and mock tutor. It includes zero-evidence 409/no-time verification and visual partial-debrief assertions.

## Deferred

Unified evidence for legacy lesson attempts/reviews/games needs a schema/source contract; client-trusted game scoring and public self-service teacher roles require separate security/product decisions. SQLite/Render PostgreSQL compatibility, live provider quotas/timeouts, TTS speed and real pedagogical efficacy remain outside this plan.
