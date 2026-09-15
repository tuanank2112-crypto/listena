# Testing and acceptance — Account email security

## Test matrix

| Gate | Local SQLite | Vercel Preview | Production |
|---|---:|---:|---:|
| Additive schema and Prisma generation | ✅ applied local SQLite | ⬜ disposable clone | ⬜ Plan07 target |
| Verify-token lifecycle / replay | ✅ focused unit | ⬜ | ⬜ |
| Password-reset non-enumeration and atomic replay | ✅ focused route/unit | ⬜ | ⬜ |
| Auth rejects unverified credential | ✅ focused unit/proxy | ⬜ | ⬜ |
| Mail boundary failure redaction | ✅ focused unit | ⬜ | n/a |
| Feedback ownership/storage/delivery state | ✅ focused route/unit | ⬜ | ⬜ |
| Real Resend action mail | n/a | ⬜ approved disposable address | ⬜ approved rollout |
| Existing Plan07 write fence/ownership/idempotency | ✅ isolated E2E regression | ⬜ | ⬜ |

## Mandatory cases

1. Registration persists a complete learner graph plus an unverified account; it cannot establish a session before verification.
2. A verify link works once, expired/replayed/unknown links give the same `TOKEN_INVALID` response, and successful verification permits sign-in.
3. Reset request for a valid address, unknown address, and an address with unavailable mail each return exactly `202 { accepted: true }` after valid input.
4. A reset link changes exactly one password and is unusable after success, even under concurrent/retried requests.
5. No route body, log test, or persisted column contains the raw token or `RESEND_API_KEY`.
6. An authenticated verified learner creates one feedback record; a spoofed user identifier cannot alter its owner; delivery failure records `EMAIL_UNAVAILABLE` without losing the message.
7. New account pages are in `proxy.ts` public paths while their API writes remain behind the Vercel migration fence.

## Exit gates

- ✅ local — additive migration applied to local SQLite; Prisma validate/status, 425 unit tests across 87 files, type-check, lint (0 errors; existing warnings), standard production build, and isolated fresh-SQLite E2E 20/20 pass.
- ⬜ Preview disabled — artifact builds with mail config names present; read paths and public pages work while writes remain fenced.
- ⬜ Preview enabled — disposable clone proves full action links, one reset, feedback receipt, owner isolation, and provider result without secret exposure.
- ⬜ server — production is evaluated only under Plan07 target/export/cutover gates.

## Evidence standard

Tests must record counts, hashes/fingerprints, status codes and redacted provider outcomes. A green unit test, a configured secret, or a mail-template snapshot alone does not prove real inbox delivery or account ownership.
