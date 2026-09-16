# P100 — Architecture and orchestration contract

Status: PLANNED. Read this file, then `01-CONTRACTS`, the owned WP, `OPERATIONS`, and `TESTING-ACCEPTANCE`.

## Goal

Make the current ListenAI codebase safe to hand to implementation workers and safe to consider for a later write-enabled release. Preserve the AI-native loop; harden legacy mutations, authoring, dependency/runtime boundaries and reproducible evidence.

## Architectural invariants

1. Server owns grading, validators, ownership, mastery/evidence and mutation identity. Client IDs deduplicate intent; they never authorize or score it.
2. One user intent produces at most one committed domain outcome. A replay with the same ID and same canonical body returns the prior result; the same ID with a different body returns conflict.
3. A domain graph is committed atomically. Optional provider enrichment may fail without corrupting the deterministic core, but it cannot be reported as persisted if its trace/graph did not commit.
4. Local/E2E uses isolated SQLite. `APP_RUNTIME=vercel` uses complete Turso configuration or fails closed. Plan10 never adds hosted fallback, D1 dual-write or PostgreSQL support.
5. The browser never receives correct answers/private validators, raw action tokens, provider keys, database endpoints or internal exception strings.
6. No worker may claim hosted mail, live AI, Vercel Production, learner efficacy or rollback readiness from local tests.
7. Dependency remediation is smallest-safe-change: remove unused packages and use patch/minor updates first. Major framework/ORM/provider migrations require a separate decision.

## Non-goals and forbidden zones

| Forbidden / excluded | Reason |
|---|---|
| Rewrite Mission/Coach/Quest, learner memory, planner, provider boundary or adaptive games | Current review found no P0/P1 requiring replacement. |
| Create synthetic LearningSession/LearningEvidence for legacy attempts or flashcards | It would falsify evidence provenance. |
| Add PostgreSQL, Redis, a vector DB, agent framework or new auth provider | Not needed for evidenced risks and expands operations. |
| Run `db:reset`, seed/import on a learner DB, mutate D1/Turso/Production, change DNS or inspect secret values | Outside Plan10 authority. |
| Use `npm audit fix --force`, broad ignore rules or unreviewed major upgrades | May silently break Next/Prisma/Auth.js/runtime contracts. |
| Delete `render.yaml`, Docker/Postgres material, odd untracked files or historical Cloudflare assets without an explicit disposition | They may be rollback/user artifacts; quarantine/document first. |
| Treat a 429, typed provider-unavailable response or green mock test as live-service success | Wrong evidence class. |

## Worker sequencing and file locks

P100 has the only write lease for `prisma/schema.prisma`, the new migration, shared validation schemas and this contract. After the migration is frozen:

- P102 owns legacy attempt/flashcard routes, repos and learning service.
- P103 owns teacher lesson/generation routes and the lesson-creation service.
- P104 owns logger/account/TTS boundary files and hosted WAF documentation.
- P101 exclusively owns `package.json` and `package-lock.json`; P105 starts package/config work only after P101 hands back the lock.
- `src/lib/libsql-batch.ts`, `src/lib/prisma.ts`, `src/server/validation/schemas.ts`, `.env.example`, `README.md` and brain files are shared: one writer at a time through root.

P102/P103/P104 may run in parallel only after P100 publishes the migration hash and allocates non-overlapping files. P105 waits for their public contracts; P106 is integration-only and does not silently repair worker code while reviewing it.

Every worker returns:

```ts
type WorkerHandoff = {
  wpId: "P101" | "P102" | "P103" | "P104" | "P105" | "P106";
  baseCommit: string;
  changedFiles: string[];
  migrationHash?: string;
  commands: Array<{ command: string; exitCode: number; environment: "local" | "ci" | "preview" }>;
  evidence: string[];
  unresolvedRisks: string[];
};
```

Narrative completion without actual diff/command evidence is rejected.

## Error classes and caller obligations

| Class | Required behavior |
|---|---|
| `VALIDATION_ERROR` | 400; field-safe message; no write/provider call. |
| `UNAUTHENTICATED` / `FORBIDDEN` | 401/403 or owner-private 404 as contract specifies; no object existence leak. |
| `IDEMPOTENCY_CONFLICT` | 409; caller must create a new client ID only for a genuinely new intent. |
| `OUTCOME_PENDING` | 409/425 with bounded retry guidance; caller reuses the same ID. |
| `DATABASE_UNAVAILABLE` | opaque 503; preserve client ID and retry later. |
| `PROVIDER_UNAVAILABLE` / `RATE_LIMITED` | typed status; do not invent output or progress. |
| `MIGRATION_WRITE_DISABLED` | 503 before application write; hosted worker must not bypass it for proof. |
| Dependency advisory unresolved | P106 blocks release or records an explicit owner/date/runtime-exposure exception; never silently ignore. |

## Acceptance evidence

Acceptance requires fault injection, concurrent replay, all-table fingerprints where a read-only claim is made, exact row/counter invariants, zero high/critical advisories in the deployable graph or an approved narrow exception, and environment-labelled gates. Full matrix is in `TESTING-ACCEPTANCE.md`.
