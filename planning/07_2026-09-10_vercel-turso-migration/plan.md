# Plan 07 — Vercel and Turso migration

- STT: 07
- Status: IN PROGRESS — local runtime separation and staging proof authorized; no Turso/Vercel account, data, DNS, or traffic mutation has occurred
- Started: 2026-09-10 (Asia/Saigon)
- Target: 0.6.0 MINOR
- Acceptance environments: local Node/SQLite, Turso staging, Vercel Preview, then public Vercel production

## Decision log

- 2026-09-10: The user requires a non-commercial, low-cost production replacement for Cloudflare that serves requests without a personal machine running continuously. The chosen candidate is Vercel Hobby plus Turso Free, subject to staging gates; it is not an uptime SLA.
- 2026-09-10: Turso is selected over a PostgreSQL service because ListenAI's canonical schema and current Prisma data model are SQLite. This avoids a dialect/data-model rewrite, but does not permit an unreviewed D1 copy.
- 2026-09-10: Vercel must use the Next.js Node runtime. Worker-specific OpenNext, D1 binding, Prisma WASM, and Worker transaction assumptions cannot be retained on the Vercel request path.
- 2026-09-10: The current Cloudflare Worker and D1 remain a rollback asset. This plan never resets, deletes, seeds, mutates, or dual-writes the live D1 database.
- 2026-09-10: The production migration authority must be explicitly baselined after D1 import. Prisma migrations must never be blindly replayed against an imported Turso schema.
- 2026-09-10: A real Kira lesson smoke belongs to the new hosting acceptance only after Vercel/Turso staging succeeds. It is not a reason to keep advancing the Cloudflare path.
- 2026-09-11: P71/P72 now pass the full local gate on the final candidate: explicit local/Turso separation, provider-neutral atomic libSQL batches, opaque database failures, a hosted write fence, and an offline read-only migration verifier. This is local evidence only; it does not establish a Turso database, Vercel deployment, D1 export, or traffic change.
- 2026-09-11: Credentials login no longer mounts `SessionProvider` on the public login/register pages. This removes a first-load Auth.js CSRF-cookie race without disabling CSRF or changing the Auth.js route behavior.

## Superseded decisions

- Plan05/06's Cloudflare Workers plus D1 runtime is superseded as the target production architecture, not erased as a rollback deployment or historical record.
- The historical requirement that multi-row server commits use native D1 DB.batch is superseded by a provider-neutral libSQL atomic batch contract. The all-or-nothing and conditional-claim guarantees are not superseded.
- A database URL alone is no longer sufficient for hosted production. Turso requires a separate URL and opaque authentication token, and missing partial configuration must fail closed.

## Work packages

| Package | Owner / model | Scope | Dependency | Acceptance |
|---|---|---|---|---|
| P71 Runtime boundary | Astra | Vercel Node/Turso configuration and Prisma adapter boundary | none | local SQLite and Turso are explicit, fail-closed modes |
| P72 Atomic learning writes | Astra | replace D1-only batch surface without weakening fences | P71 | budgets, missions, games, lessons preserve exactly-once evidence |
| P73 Data migration | Astra | D1 export/import rehearsal, fingerprints and baseline | P71 | staging import preserves schema, rows, IDs, relations, timestamps |
| P74 Vercel staging/cutover | Astra | Node build, Preview, secrets/runbook, controlled production switch | P71-P73 | authenticated flow and bounded live AI prove on staging before cutover |
| P75 Knowledge/rollback | Astra | docs, memory, release record and rollback procedure | P71-P74 | every environment gate has recorded evidence |

## Execution checklist

- [x] Recover the actual latest session intent and research current hosting alternatives.
- [x] Verify current Next.js deployment, environment, Node runtime, and route-duration guidance.
- [x] Create this spec package before implementation.
- [x] Implement P71 local runtime boundary and fail-closed Turso configuration.
- [x] Implement P72 generic libSQL atomic batch and regression tests.
- [x] Remove Cloudflare-only initialization from the Vercel build path; retain historical deployment files until post-cutover review.
- [x] Pass local type, unit, lint, Next build, and isolated browser gates.
- [x] Implement and test the read-only P73 source/target verifier; the separately approved staging write/read/delete proof remains a hosted gate.
- [ ] Obtain user-owned Turso and Vercel accounts / staging credentials without recording secrets.
- [ ] Rehearse D1 to Turso staging import and verify fingerprints.
- [ ] Deploy Vercel Preview and pass auth, persistence, private lesson, and AI smoke gates.
- [ ] Obtain explicit approval for final D1 export window and public traffic cutover.
- [ ] Synchronize implementation/runbook knowledge and commit/push the local staging candidate.
- [ ] Cut over once after its separately approved final-export and public-traffic window; retain Cloudflare rollback.

## Spec router

| Contract | Specification |
|---|---|
| Architecture, invariants and forbidden zones | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| Runtime/data/API contracts | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| Node/Turso runtime implementation | [P71 runtime](specs/SPEC-P71-RUNTIME.md) |
| Atomic learning persistence | [P72 transactions](specs/SPEC-P72-ATOMICITY.md) |
| D1 to Turso migration | [P73 data migration](specs/SPEC-P73-DATA-MIGRATION.md) |
| Vercel staging and cutover | [P74 deployment](specs/SPEC-P74-VERCEL-DEPLOYMENT.md) |
| Runbook and rollback | [OPERATIONS](specs/OPERATIONS.md) |
| Test matrix and exit gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
