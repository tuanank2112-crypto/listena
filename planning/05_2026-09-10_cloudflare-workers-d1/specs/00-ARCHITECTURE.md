# Architecture — Workers + D1

## Goal

Run the existing authenticated ListenAI App Router application in Cloudflare Workers with durable learner data in one D1 binding named `DB`.

## Architecture contract

`browser → Cloudflare Worker (OpenNext Next App Router) → request-scoped D1 adapter → D1`.

All server components, route handlers and Auth.js credential checks share the request-scoped adapter. D1 is the sole production source of truth. Client code never receives `D1Database`, credentials, or correct-answer state.

## Required invariants

- **MUST** retain App Router routes, server authorization and Plan04 completion/evidence contracts.
- **MUST** obtain `DB` from the Cloudflare request context; **MUST NOT** cache a D1 binding on `globalThis` across requests.
- **MUST** create production D1 schema only through checked-in, append-only SQL migrations.
- **MUST** retain local `next dev` and the isolated SQLite E2E test workflow until D1 gates replace them with equivalent evidence.
- **MUST** use the fixed public `workers.dev` origin configured in Worker variables for Auth.js redirects; the user authorized this public release on 2026-09-10.

## Forbidden zones

- **MUST NOT** static-export the app, put learner records in browser storage, use a runtime `CREATE TABLE`, or seed/reset a deployed D1 database.
- **MUST NOT** publish `OPENAI_API_KEY`, `NEXTAUTH_SECRET`, TTS keys or any local `.env` value in Git, build output or client bundle.
- **MUST NOT** claim a remote TTS sidecar is hosted by Workers; Workers call it only over HTTPS when configured.

## Error classification

| Failure | Caller behavior |
|---|---|
| Missing `DB` binding | Fail startup/request with a typed configuration error; no fallback to local SQLite in production |
| D1 constraint/query error | Return existing sanitized server error; log safe request context; never retry non-idempotent writes blindly |
| Unsupported Worker API | Block release and replace/isolate the dependency before deployment |
| Optional TTS upstream failure | Return an unavailable/fallback response; learning session persists normally |

## Acceptance evidence

- Worker bundle exports `fetch(request, env, ctx)`.
- An isolated D1 test proves login lookup and a learner write/read round trip.
- The public `workers.dev` smoke test loads `/api/health`, completes CSRF/Credentials/session authentication and performs a D1-backed registration before removing its exact temporary accounts.
