# Operations

## Command contract / order
Run boot engine with repository root and `--check`; `npm test`, `npm run type-check`, `npm run lint`; `npx prisma validate`; `npm run eval`; `npm run build`; `npm run test:e2e` with existing isolated temp database setup. E2E applies migrations to temp database only. Inspect available local server/build locks before executing build/E2E; do not stop unrelated processes.

## MUST / MUST NOT
- MUST retain existing working changes and untracked files; no git reset/clean.
- MUST NOT run db:reset, seed or schema migration against learner database.
- MUST NOT deploy current Render PostgreSQL blueprint against SQLite schema. Production provider migration is DEFERRED pending dedicated data/deployment plan.
- MUST configure same TTS_API_KEY in app and sidecar; loopback port binding is default local boundary. No production publishing in this work.

## Error matrix
| Failure | Required caller action |
|---|---|
| Unit/type/build/E2E fails | Investigate, delegate correction, rerun affected gates |
| External TTS model unavailable | Verify request boundaries with model-free tests; disclose real speech not tested |
| Existing Next dev lock | Identify owning process; avoid terminating unrelated user work |
| Rollback requested | Revert only this work's reviewed hunks; schema unchanged, never reset user data |

## Evidence / environment gates
Local acceptance pending. Production DB, deployment and real TTS inference explicitly outside acceptance environment; do not claim verified. E2E database isolation is already source-verified in e2e/setup.ts.
