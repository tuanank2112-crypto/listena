# Testing and acceptance

## Test matrix

| Gate | Local SQLite | Local Worker D1 | Public Worker + D1 |
|---|---|---|---|
| Schema migration/client generation | ✅ | ✅ | ✅ |
| Core importer is additive/idempotent | n/a | ✅ | ✅ |
| Missing provider returns honest 503 | ✅ | ⬜ | ⬜ |
| OpenAI Responses structured-output request/validation (optional provider) | ✅ | n/a | n/a |
| Kira Chat Completions JSON parse/Zod validation (selected provider) | ✅ | n/a | ⬜ |
| Kira canonical origin + no redirect credential egress | ✅ | n/a | ⬜ |
| Shared AI reservation (pending/cooldown/rolling) | ✅ | ✅ SQL emulation | ⬜ |
| Native D1 state/claim fence cannot add duplicate evidence/mastery | ✅ | ✅ SQL emulation | ⬜ |
| Private lesson ownership/no validator leak | ✅ | ⬜ | ⬜ |
| Calibration threshold/no one-answer CEFR flip | ✅ | ⬜ | n/a |
| Server-authoritative adaptive game/exactly once | ✅ | ⬜ | ⬜ |
| Existing curriculum/auth regressions | ✅ | ⬜ | ✅ |
| Build/type/lint/unit/e2e | ✅ | ⬜ | n/a |
| Hosted secret + genuine-provider smoke | n/a | n/a | ⬜ |

## Mandatory proof

- Tests must use explicit injected deterministic providers only; they must not depend on real user keys.
- A Kira transport test must capture `POST /chat/completions`, Bearer authorization without fixture key leakage, bounded timeout/output, JSON parsing and Zod rejection. It must not assert undocumented Responses-only fields.
- A Kira transport test must reject a foreign origin/path, HTTP/user-info/query/fragment and redirects before a bearer credential can leave the Worker.
- An OpenAI transport test must capture `POST /responses`, strict JSON schema, `store:false`, timeout and no secret in output/log fixture.
- A test must demonstrate that a browser body containing `correct: true` cannot change vocabulary mastery.
- A test must prove two owners cannot fetch or answer another user's resource and that public DTO serialization lacks private validator fields.
- A test must prove same `clientAnswerId`/attempt ID creates one evidence/mastery update only.
- A test must execute the D1 conditional reservation and native mission/game SQL against a SQLite-compatible D1 emulation: one live reservation wins, a stale state/claim cannot create a second evidence/mastery row.
- D1 integration must execute core import twice and compare counts/hash invariants.

## Exit gates

- ✅ local — `npx tsc --noEmit`, `npm test` (225), `npm run lint` (0 errors / 34 pre-existing warnings), `npm run build:worker` and `npm run test:e2e` (16/16) green.
- ✅ local Worker D1 — migration/import ownership checks plus native reservation, mission state-CAS and adaptive claim SQL execute in isolated SQLite-compatible D1 emulation; private lesson/attempt statement-contract tests are green.
- ✅ server — remote D1 additive migration/import counts verified; pre-existing user preserved.
- ✅ server — P65/Kira code deployed as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250`; public `/api/health` and `/login` returned HTTP 200 with the hosted Kira key still absent. Worker `8d50494f-773f-46bb-9910-23c4474d9b4d` is the pre-P65 baseline.
- ◐ server — `KIRAAI_API_KEY` binding is deployed in secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b`; its value is opaque. A real provider smoke must still produce a persisted private lesson without exposing secrets.

## Failure classification

| Failure | Gate handling |
|---|---|
| Test-double or schema failure | block local gate; repair contract before deployment |
| Remote migration/import discrepancy | block server gate; do not reset database |
| Missing secret/provider billing/permissions | implementation may ship honest unavailable UI, but live-AI server gate remains open |
| Worker/D1 quota | report metrics and redesign/upgrade deliberately; never mark the gate passed |
| Native batch/fence regression | block local and server mutation gate; do not deploy a compensating Prisma transaction |
