# Contracts

## Runtime and database configuration

| Name | Scope | Contract |
|---|---|---|
| `APP_RUNTIME` | every process | Exact `local` or `vercel`. It is required for a hosted deployment; whitespace or any other value fails closed. |
| `DATABASE_URL` | local Node/dev/E2E only | `file:` SQLite URL. It is never a Vercel persistence fallback. |
| `TURSO_DATABASE_URL` | explicit Vercel/Turso only | Server-only `libsql:` or `https:` origin URL with no embedded credentials, query, hash, or non-root path. |
| `TURSO_AUTH_TOKEN` | explicit Vercel/Turso only | Opaque server-only token. |
| `MIGRATION_WRITE_MODE` | migration fence | Exact `enabled` or `disabled`; hosted values fail closed unless exactly `enabled`. |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | hosted auth | Opaque fresh Auth.js signing secret; it is separate from Cloudflare. |
| `AUTH_URL` / `NEXTAUTH_URL` | hosted auth | Public Vercel origin after cutover; do not retain the `workers.dev` origin. |
| `KIRAAI_API_KEY` | hosted AI | Opaque key in the target platform secret store. |

The public runtime surface is:

~~~ts
resolveDatabaseConfig(env?: NodeJS.ProcessEnv): DatabaseConfig
getDatabaseRuntime(): "local-sqlite" | "turso"
prisma: PrismaClient
getAtomicLibSqlClient(): Client
toLibSqlTimestamp(value: Date): number | string
~~~

`resolveDatabaseConfig` MUST select `turso` only for `APP_RUNTIME=vercel` with both Turso values. It MUST select `local-sqlite` only when no Vercel marker exists and `DATABASE_URL` is a valid local `file:` URL. A `VERCEL_*` marker without exact `APP_RUNTIME=vercel`, either incomplete Turso variable, or any inherited Turso credential outside explicit Vercel mode throws `DatabaseConfigurationError` with `DATABASE_CONFIGURATION_MISSING` before a database connection is constructed. The implementation MUST NOT log, return, serialize, cache in a visible value, or otherwise disclose the token.

Prisma uses the Node `PrismaLibSQL` adapter in both modes: local uses `timestampFormat: "unixepoch-ms"`; Turso uses `timestampFormat: "iso8601"`. A warm Node process may cache clients by a non-reversible token fingerprint. Worker D1, Prisma WASM, and `getCloudflareContext` are forbidden from the Vercel application module graph.

## Migration write fence

`resolveMigrationWriteMode(env?)` has these mandatory semantics:

- In a hosted Vercel runtime, only the exact value `enabled` permits unsafe writes. Missing, malformed, and `disabled` values resolve to `disabled`.
- Locally, writes retain their existing default (`enabled`); an exact local `disabled` value can still deliberately close the fence.
- `proxy.ts` returns `503` with `MIGRATION_WRITE_DISABLED` before application database work for unsafe `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api/**`.
- Auth.js owns `/api/auth/**` and is excluded from the Proxy matcher so its CSRF/session requests retain their framework semantics. This is a login exception only: `/api/register` and every other unsafe application API request remain fenced while hosted writes are disabled.

## Prisma and atomic batch contract

~~~ts
type LibSqlBatchStatement = {
  sql: string
  values?: Array<string | number | null>
}

type AtomicLibSqlBatchResult = {
  changes: number
}

executeAtomicLibSqlBatch(
  statements: LibSqlBatchStatement[],
): Promise<AtomicLibSqlBatchResult[]>

libSqlTimestamp(value: Date): number | string
libSqlBoolean(value: boolean): 0 | 1
~~~

The implementation uses libSQL batch mode `"write"`; a rejected later statement rolls back the whole batch. Statements MUST be parameterized; user content MUST NOT be concatenated into SQL. Callers MUST validate the expected `changes` commit fence before returning a success DTO. Duplicate client IDs, answer IDs, generation keys, or request IDs MUST yield the existing committed DTO or a typed conflict, never a second mutation.

`libSqlTimestamp` is mandatory for guarded raw SQL: local SQLite receives Unix milliseconds and Turso receives canonical ISO `+00:00`. Code MUST NOT hard-code one representation for both modes.

Configuration errors occur before the batch. Integrity/constraint errors remain intact so callers can resolve conflict/idempotency behavior. A non-integrity operational batch rejection maps to opaque `DatabaseUnavailableError` / `DATABASE_UNAVAILABLE`; it MUST NOT expose SQL, endpoint, token, or driver cause.

## Data migration contract

~~~text
source: Cloudflare D1 snapshot
target: separate Turso staging or production database
authority: reviewed production baseline manifest after import
~~~

The manifest records migration hashes, semantic schema, table counts, redacted primary-key fingerprints where practical, curriculum relations, user/evidence aggregates, and timestamp evidence. A target is valid only if every required invariant matches or has an approved, documented conversion. The staging target is never promoted to production.

## Error contract

| Error code | HTTP/status mapping | Caller behavior |
|---|---|---|
| `DATABASE_CONFIGURATION_MISSING` | `503`, `Cache-Control: no-store` | Show a non-secret unavailable state; do not fall back to local data. |
| `DATABASE_UNAVAILABLE` | `503`, `Cache-Control: no-store` | Preserve the client ID and allow an idempotent retry. |
| `MIGRATION_WRITE_DISABLED` | `503` | Leave data unchanged; do not retry a disabled deployment as if it were an operational DB failure. |
| `DATABASE_CONFLICT` | `409` or existing DTO | Refresh state or reuse the committed outcome. |
| `DATABASE_INTEGRITY_MISMATCH` | deployment blocker | Do not switch traffic; retain the source database. |
| `AI_REQUEST_LIMIT` | existing `429` contract | Render bounded retry guidance. |
| `AI_UNAVAILABLE` | existing `503` contract | Settle reservation; never fabricate an AI result. |

`databaseErrorResponse(error)` maps only the two deliberately opaque database errors above and returns the Vietnamese generic message plus the stable code. It MUST NOT include a raw driver error, `cause`, connection URL, or credential.

## Contract test evidence

- Runtime tests cover local SQLite, complete Turso, partial/malformed configuration, inherited Turso credentials, and Vercel markers without explicit `APP_RUNTIME=vercel`.
- Proxy tests prove the hosted disabled fence and the deliberately excluded Auth.js matcher.
- Batch tests prove a later failing statement rolls back an earlier insert; learning, game, lesson, and AI-budget regressions preserve their idempotency fences.
- Operational-error tests use an unreachable libSQL endpoint and prove a typed, opaque `503` response without credential material.
