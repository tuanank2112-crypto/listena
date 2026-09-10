# Operations — deploy, rollback and data safety

## Required order

1. Build and test the Worker against a fresh isolated/local D1 database.
2. Inspect new immutable migration SQL for statements, foreign keys and indexes.
3. Create/reuse the Worker D1 binding with logical binding name `DB`.
4. Set `NEXTAUTH_SECRET` as a hosted secret and configure only opted-in AI/TTS values.
5. Save and publish the exact tested commit to the public `workers.dev` origin only after the user has authorized public access.
6. Verify `/api/health`, login/session and a D1-backed write; remove any exact smoke-test data afterward.

## Environment variables

| Name | Required | Storage |
|---|---:|---|
| `NEXTAUTH_SECRET` | yes | hosted secret |
| `AUTH_URL` | recommended | hosted environment |
| `NEXTAUTH_URL` | recommended | hosted environment |
| `AI_PROVIDER` | no | hosted environment |
| `OPENAI_API_KEY` | only when `AI_PROVIDER=openai` | hosted secret |
| `VIENEU_URL`, `TTS_API_KEY` | no | hosted environment/secret |

## Rollback

- Roll back Worker code by republishing the prior saved version.
- Migrations are not rolled back automatically. A schema incident requires a forward, reviewed migration; do not drop live learner tables.
- Disable optional AI/TTS via hosted variables before rolling back core learning functionality.

## Import runbook

- Export and checksum the explicit local source first.
- Run the migration/import command in dry-run mode; compare row counts and selected learner/session/evidence relations.
- The user must explicitly authorize the named production target before the write mode. Never overwrite an existing production D1 database.

## Acceptance evidence

- Deployment record identifies source commit, schema migration set and public access state.
- Rollback procedure is executable without database deletion.
