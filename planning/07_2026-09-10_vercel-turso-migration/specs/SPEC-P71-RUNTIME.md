# P71 — Vercel Node and Turso runtime

## Scope

Replace the production Cloudflare runtime branch with a Node/libSQL runtime suitable for Vercel, without changing learner-facing API shapes.

## Required implementation

1. Remove OpenNext Cloudflare initialization from next.config.ts on the Vercel build path.
2. Refactor `src/lib/prisma.ts` to implement the public `resolveDatabaseConfig`, `getDatabaseRuntime`, `prisma`, `getAtomicLibSqlClient`, and `toLibSqlTimestamp` contract in 01-CONTRACTS.
3. Create an explicit configuration-error type suitable for route-level typed unavailable handling.
4. Preserve local dev, scripts, Prisma generation, isolated E2E database setup, and the existing node-sqlite timestamp behavior.
5. Require Node 24 through `.nvmrc` and `package.json` engines. Mark the bounded server routes `runtime = "nodejs"; maxDuration = 60`: `learning-sessions`, `learning-sessions/[sessionId]/turns`, `tutor`, `learner/personalized-lessons`, and `teacher/generate-lesson`.
6. Add Vercel configuration only when it establishes a concrete contract. Do not add a speculative region, paid feature, analytics, or custom domain.

## Forbidden zones

- Do not put a token in DATABASE_URL committed fixtures, examples, test output, or deployment configuration.
- Do not detect Turso by hostname heuristics; require explicit variables.
- Do not make a hosted Vercel request fall back to file:./dev.db or /tmp.
- Do not retain an import of getCloudflareContext, PrismaD1, or Prisma client wasm in code reachable by Vercel.
- Do not infer Vercel runtime from a Turso hostname or an inherited token. A Vercel marker without exact `APP_RUNTIME=vercel` is an error, not an alternate selector.

## Failure classification

| Failure | Required behavior |
|---|---|
| only one Turso variable exists | throw DATABASE_CONFIGURATION_MISSING before database connection |
| invalid libSQL URL | throw DATABASE_CONFIGURATION_MISSING without leaking URL/token details |
| remote connect error | map to DATABASE_UNAVAILABLE; preserve idempotency ID |
| Next build imports a Cloudflare-only package | block local gate; remove the production path import |
| Vercel route uses Edge | block staging gate; force/default Node runtime |
| Vercel marker without explicit APP_RUNTIME=vercel | throw DATABASE_CONFIGURATION_MISSING before database construction |

## Acceptance evidence

- `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e` pass on the final local tree with no Turso secret.
- `npm run build` succeeds with local build variables and does not require Wrangler/OpenNext.
- A focused runtime test exercises local SQLite, complete Turso configuration, partial configuration, and Vercel production missing configuration.
- The server bundle scan contains no Cloudflare runtime import from application code.
