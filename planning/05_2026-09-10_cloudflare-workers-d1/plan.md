# Plan 05 — Cloudflare Workers + D1 deployment

- STT: 05
- Status: COMPLETE — public Workers deployment verified
- Started: 2026-09-10 (Asia/Saigon)
- Target: 0.4.0 MINOR
- Acceptance environment: local Node/E2E SQLite, local Worker D1 emulator and public Cloudflare Workers + D1 deployment.

## Decision log

- 2026-09-10: User selected Cloudflare Workers + D1 after rejecting Oracle because its signup commonly requires a payment card. This package replaces the prior VPS/Render deployment direction; it does not claim that third-party AI inference is free.
- 2026-09-10: Keep the existing Next App Router source and adopt Cloudflare's recommended Vinext migration path only after its compatibility check passes. Do not replace ListenAI with a static export: Auth.js, learner state and APIs require a server runtime.
- 2026-09-10: Preserve SQLite's relational semantics in D1. Production schema is migration-owned and no production seed/reset is permitted. Existing developer/E2E SQLite data remains local-only until an explicit one-time import procedure is accepted.
- 2026-09-10: Remove the Worker-incompatible file-system TTS cache from the production request path. The remote VieNeu sidecar is optional; a missing or failed sidecar must degrade to browser speech rather than break a learning session.
- 2026-09-10: Vinext compatibility check passed 16/18 but rejected existing `next-auth`; migrating authentication just to satisfy that beta adapter is out of scope and unsafe. The package uses OpenNext instead, which supports the App Router/route handlers/SSR and Node.js runtime. Next was raised from 16.3.1 to 16.3.3 to satisfy the adapter peer range and security patch boundary. Cloudflare OAuth was user-completed; D1 `listena-english` was created empty in APAC and received schema-only migration `0001_initial_schema.sql` (56 commands), with no seed or user import.
- 2026-09-10: The user's request to publish on Cloudflare Workers + D1 authorizes a public `workers.dev` release after all local gates pass. No custom domain, data import, third-party AI secret, or paid Cloudflare feature is implied.
- 2026-09-10: OpenNext Worker build was verified without embedding local `NEXTAUTH_SECRET`, `OPENAI_API_KEY` or `TTS_API_KEY`. The required auth secret is a hosted Worker secret. `AUTH_URL` and `NEXTAUTH_URL` are non-secret Worker variables fixed to the public `workers.dev` origin; Auth.js uses `trustHost: true` because OpenNext internally invokes the route through `localhost:3000` after Cloudflare has terminated the public HTTPS request.
- 2026-09-10: Final Worker version `ec0849c7-7f01-46e5-bdf4-be8392268fdc` passed production health, D1-backed registration, Credentials CSRF/login/session smoke tests. All temporary smoke accounts were selected by exact test IDs and deleted; the final query confirmed zero remaining. No user import or seed ran on production D1.

## Superseded decisions

- Plan04's "Render PostgreSQL compatibility is deferred" is superseded only for deployment: this package targets D1/SQLite, not Render/PostgreSQL. Plan04 learning contracts and all local acceptance claims remain unchanged.

## Work packages

| Package | Owner / model | Scope | Dependency | Acceptance |
|---|---|---|---|---|
| P51 Runtime compatibility | Astra | OpenNext/Worker config, bindings and Node-only boundary audit | none | Worker build emits a callable fetch entrypoint; normal Next local dev remains available |
| P52 D1 persistence | Astra | D1 adapter boundary, immutable schema migrations, local D1 integration | P51 | auth, session, learning evidence and dashboard queries execute against an isolated D1 binding |
| P53 Edge-safe services | Astra | remove per-request fs cache; runtime environment validation; security headers | P51 | TTS failure falls back without disk writes; secrets exist only in hosted runtime variables |
| P54 Publication and evidence | Astra | public release, smoke test, docs and rollback record | P51–P53 | deployed Worker has a public `workers.dev` URL, D1 schema and authenticated endpoint smoke tests pass |

## Execution checklist

- [x] Verify brain boot and read kernel/index/hot state/active plan.
- [x] Read current Next local documentation and Cloudflare's current official migration guidance.
- [x] Create complete spec package before migration edits.
- [x] Run and record Vinext compatibility result; resolve framework-version constraint.
- [x] Implement Worker runtime and D1 schema migration.
- [x] Implement adapter/request-context and edge-safe TTS boundary.
- [x] Run isolated D1, unit, type, Worker build and deployment smoke gates.
- [x] Publish public `workers.dev` release under the user's explicit authorization.
- [x] Synchronize project knowledge after production evidence; commit/push is the final follow-up.

## Spec router

| Contract | Specification |
|---|---|
| Architecture, scope and forbidden zones | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| API/module/data contracts | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| Runtime migration | [P51 runtime](specs/SPEC-P51-WORKER-RUNTIME.md) |
| D1 persistence | [P52 D1](specs/SPEC-P52-D1-PERSISTENCE.md) |
| Edge-safe integrations | [P53 edge services](specs/SPEC-P53-EDGE-SERVICES.md) |
| Deploy, rollback and import controls | [OPERATIONS](specs/OPERATIONS.md) |
| Test matrix and environment gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
