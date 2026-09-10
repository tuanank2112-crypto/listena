# Contracts — runtime, data and APIs

## Runtime binding

```ts
export interface CloudflareEnv {
  DB: D1Database;
  NEXTAUTH_SECRET: string;
  AUTH_URL?: string;
  AI_PROVIDER?: "mock" | "openai";
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  VIENEU_URL?: string;
  TTS_API_KEY?: string;
  VIENEU_DEFAULT_VOICE?: string;
}
```

`DB` is required at Worker runtime. Secrets are set as hosted secrets, not as source variables.

## Persistence boundary

```ts
export type DatabaseRuntime = "node-sqlite" | "cloudflare-d1";
export function getDatabaseRuntime(): DatabaseRuntime;
export const prisma: PrismaClient;
```

- Node/local tests use `PrismaLibSQL` against the configured SQLite file with `unixepoch-ms` timestamps, retaining compatibility with existing local data.
- Worker request code resolves Prisma's `@prisma/client/wasm.js` entrypoint with a `PrismaD1` adapter from current-request `env.DB`; the Node-only libSQL module is dynamically loaded only outside Workers.
- Callers **MUST** continue importing `prisma` only from `@/lib/prisma`; they must not instantiate `PrismaClient` in application code or retain a D1 binding globally.

## Schema/migrations

- Production schema must express the current `prisma/schema.prisma` entities and their uniqueness/index constraints as D1-compatible SQL.
- `migrations/NNNN_*.sql` files generated from the Prisma schema and applied by Wrangler are append-only. Each statement is single-purpose and D1-safe.
- Existing local Prisma migrations are retained for local SQLite E2E and are not applied automatically to production D1.

## TTS route

`POST /api/tts/vie` preserves request/response shape. In Worker runtime it **MUST NOT** import `node:fs` or cache bytes on disk. If `VIENEU_URL`/`TTS_API_KEY` is absent or upstream fails, it returns the documented unavailable outcome so the client chooses browser speech.

## Error classification

| Contract error | Status / caller action |
|---|---|
| Database runtime missing binding | 503, report deployment configuration fault |
| D1 adapter initialization failure | 503, no local fallback in Worker |
| Missing optional TTS config | existing graceful unavailable response |
| Auth secret missing | startup/release blocker; do not issue sessions |

## Acceptance evidence

- Type tests compile the binding and adapter contracts.
- Production grep/build has no `node:fs` in any Worker-reachable route.
- A D1 migration inspection verifies all `@@unique` and user/session query indexes are represented.
