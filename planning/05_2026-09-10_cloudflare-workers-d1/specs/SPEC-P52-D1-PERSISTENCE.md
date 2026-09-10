# P52 — D1 persistence

## Contract

Move production persistence from the local SQLite file to D1 while preserving Prisma model semantics and all server-owned learning evidence.

## Required work

- Use the Cloudflare Prisma D1 adapter only behind the `prisma` request-context boundary.
- Create an initial D1 migration from a reviewed schema; include FK enforcement and only indexes justified by current query patterns.
- Test production-shaped read/write operations in a fresh isolated D1 database. No test may use a developer's local learner database.
- Provide a separate, opt-in import command that validates source/target, runs once and records count/checksum. It must default to dry-run.

## Forbidden zones

- No automatic import from `.env` SQLite to D1.
- No `prisma migrate deploy` against D1, runtime DDL, destructive drop/reset, or silent downgrade of foreign keys.
- No direct `env.DB.prepare()` outside the adapter/migration infrastructure.

## Error classification

| Error | Required action |
|---|---|
| Migration syntax/SQLite error | Correct only unapplied migration, inspect it, create a new release |
| Constraint violation | Preserve application 4xx/409 behavior; do not discard evidence |
| Import count mismatch | Abort before commit; D1 remains untouched or roll back newly-created target only |

## Acceptance evidence

- Fresh D1 schema lists all required tables and query indexes.
- Isolated test verifies credentials lookup, session idempotency and evidence-backed completion.
- Import stays dry-run unless an explicit command flag names both source and target.
