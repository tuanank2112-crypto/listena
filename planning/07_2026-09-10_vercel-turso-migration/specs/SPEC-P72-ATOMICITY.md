# P72 — Atomic learning persistence on libSQL

## Scope

Move the D1-only write-batch transport to the provider-neutral libSQL atomic-batch contract while retaining the SQL, ordering, conditional claims, and response semantics that protect learning evidence.

## Covered mutation boundaries

| Module | Protected outcome |
|---|---|
| src/server/ai/request-budget.ts | one pending reservation/settlement per request and learner quota |
| src/server/learning/service.ts | one session/turn/evidence/mastery commit per client turn |
| src/server/adaptive-games/service.ts | one owned run and one scored answer/evidence claim |
| src/server/personalized-learning/service.ts | one private lesson/attempt/evidence commit |

## Required behavior

- Replace only the transport abstraction; retain parameterized SQL and commit-fence predicates.
- Use `executeAtomicLibSqlBatch` and map each raw libSQL `rowsAffected` to its public `{ changes }` result. Reject a success path if an expected claim/update affects zero `changes`.
- Keep normal Prisma callback transactions only where their existing local path remains correct; do not use them to bypass a required conditional batch.
- Use `libSqlTimestamp` in every guarded raw SQL write: local SQLite receives Unix milliseconds, while Turso receives ISO-8601 `+00:00` values compatible with imported D1 rows. Do not hard-code one timestamp representation across both modes.

## Forbidden zones

- Do not remove clientTurnId, clientAnswerId, generationKey, request/reservation ID, state-version, or claim-token checks.
- Do not expose raw query errors or SQL in an API DTO.
- Do not emulate atomicity with retry-after-write compensation.

## Failure classification

| Failure | Required behavior |
|---|---|
| configuration fails before client/batch construction | return opaque DATABASE_CONFIGURATION_MISSING and do not fall back to local SQLite |
| non-integrity batch rejection | rollback is assumed; return opaque DATABASE_UNAVAILABLE and no success DTO |
| integrity/constraint batch rejection | retain the error so caller can resolve a conflict/idempotent outcome; do not relabel every constraint as unavailable |
| expected changes is zero | retrieve existing idempotent outcome or throw DATABASE_CONFLICT |
| transaction contains unparameterized user text | block code review and test |
| timestamp parse mismatch | block staging import and normalize through reviewed migration code |

## Acceptance evidence

- `src/lib/libsql-batch.test.ts` and `src/server/learning/libsql-persistence.test.ts` prove the generic libSQL client rolls back an earlier statement after a failing final statement.
- A duplicate game answer, duplicate lesson attempt, stale session state, and duplicate AI reservation each produce exactly one persisted evidence/mastery/budget effect.
- Tests run against local libSQL and Turso staging before public cutover.
