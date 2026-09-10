# Testing and acceptance

## Test matrix

| Gate | Local SQLite | Local Worker D1 | Public Worker + D1 |
|---|---|---|---|
| Schema migration/client generation | ✅ | ✅ | ✅ |
| Core importer is additive/idempotent | n/a | ✅ | ✅ |
| Missing provider returns honest 503 | ✅ | ⬜ | ⬜ |
| Responses structured-output request/validation | ✅ | n/a | n/a |
| Private lesson ownership/no validator leak | ✅ | ⬜ | ⬜ |
| Calibration threshold/no one-answer CEFR flip | ✅ | ⬜ | n/a |
| Server-authoritative adaptive game/exactly once | ✅ | ⬜ | ⬜ |
| Existing curriculum/auth regressions | ✅ | ⬜ | ✅ |
| Build/type/lint/unit/e2e | ✅ | ⬜ | n/a |
| Hosted secret + genuine-provider smoke | n/a | n/a | ⬜ |

## Mandatory proof

- Tests must use explicit injected deterministic providers only; they must not depend on real user keys.
- A provider transport test must capture that production client sends `POST /responses`, strict JSON schema, `store:false`, timeout and no secret in output/log fixture.
- A test must demonstrate that a browser body containing `correct: true` cannot change vocabulary mastery.
- A test must prove two owners cannot fetch or answer another user's resource and that public DTO serialization lacks private validator fields.
- A test must prove same `clientAnswerId`/attempt ID creates one evidence/mastery update only.
- D1 integration must execute core import twice and compare counts/hash invariants.

## Exit gates

- ✅ local — `npm run type-check`, `npm run lint`, unit tests and relevant E2E green.
- ✅ local Worker D1 — migration/import/game/lesson ownership smoke green in isolated binding.
- ✅ server — remote D1 additive migration/import counts verified; pre-existing user preserved.
- ✅ server — production Worker build/deploy/health/auth green (Worker version `8d50494f-773f-46bb-9910-23c4474d9b4d`).
- ⬜ server — user-owned secret configured and a real provider smoke produces a persisted private lesson without exposing secrets.

## Failure classification

| Failure | Gate handling |
|---|---|
| Test-double or schema failure | block local gate; repair contract before deployment |
| Remote migration/import discrepancy | block server gate; do not reset database |
| Missing secret/provider billing/permissions | implementation may ship honest unavailable UI, but live-AI server gate remains open |
| Worker/D1 quota | report metrics and redesign/upgrade deliberately; never mark the gate passed |
