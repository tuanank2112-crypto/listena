# P61 — Additive core dataset recovery

## Contract

`scripts/build-d1-core-import.ts` reads only the approved core files `dataset/manifest.json`, `dataset/lessons.json`, `dataset/vocabulary.json`, `dataset/grammar-reference.json` and `dataset/exercises.json`, validates all expected counts and emits deterministic, statement-idempotent SQL to a caller-specified temporary file. Cloudflare D1 rejects SQL `BEGIN`/`COMMIT` in Wrangler-executed files, so every statement is independently safe to retry and no statement deletes or replaces learner-owned data. Grammar is a required input solely because the established core transcript is derived from its verified grammar text. The SQL creates/uses one explicit non-loginable system curriculum owner, then performs stable-key upserts for the approved core course, five lessons, 116 vocabulary rows, lesson-vocabulary joins, objective-derived segments and exercises.

The operations command is exactly shaped as:

```powershell
npm run dataset:build-d1-import -- --output <temporary-path>
npx wrangler d1 execute listena-english --remote --file <temporary-path>
```

The builder MUST use prepared escaping, stable deterministic UUIDs/IDs or validated stable dataset IDs, and `INSERT ... ON CONFLICT ... DO UPDATE` only for rows it owns. It MUST NOT use `DELETE`, `TRUNCATE`, `DROP`, `prisma db push`, `migrate reset`, or `prisma/seed.ts` against D1.

## Forbidden zone

- The raw Educaplay/Da Nang files, developer demo seed, user rows, mastery, session, evidence and AI interactions are out of scope and MUST NOT be written.
- A database count of zero is never grounds to run destructive seed/reset.
- The import must not depend on local `prisma/dev.db` or a developer's credentials.

## Errors and caller response

| Error | Cause | Behavior |
|---|---|---|
| `MANIFEST_MISMATCH` | source count/version differs | builder exits before output file/remote call |
| `INVALID_DATASET_VALUE` | unsupported enum or malformed field | builder exits with source path/index |
| `D1_EXECUTION_FAILED` | one or more idempotent D1 statements rejected | leave prior data intact; inspect the D1 error and rerun only the same generated additive import after correction; never use destructive recovery commands |
| `OWNER_CONFLICT` | expected system owner has incompatible role/email | stop and require explicit operator decision |

## Acceptance evidence

- Local builder test asserts 5 lessons, 116 vocabulary and 54 exercises, and SQL contains no destructive statement.
- Local D1 emulator import runs twice with stable counts.
- Server pre/post aggregate query proves curriculum rows exist and the original user count is unchanged.
