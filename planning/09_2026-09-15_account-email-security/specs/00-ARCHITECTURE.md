# Architecture — Account email security

## Goal

Give every newly registered learner a verified email identity, let a person recover a password through a bounded one-time link, and give verified learners a trustworthy email-feedback channel.

## Topology

```text
Browser → Next Route Handler → Prisma/libSQL + atomic batch → SQLite/Turso
                              ↓
                       email delivery boundary → Resend
```

## Architectural invariants

1. A raw verification or reset token exists only in the server-generated email link and the browser request that consumes it. Persistence stores a SHA-256 hash only.
2. A token has one purpose, an expiry, and a single successful consumption. Reset consumption changes the password and marks the token consumed in one atomic batch.
3. Auth.js Credentials authorizes a password only when the account email has been verified. `isEmailVerified` is a signed JWT/session claim, and the Proxy rejects a signed session without it. The token/session contains no password, raw action token, or email-verification secret.
4. Password-reset requests have indistinguishable public responses for unknown, verified, unverified, and existing addresses.
5. Mail configuration and delivery errors are server-side typed failures. They never fall back to exposing a raw action link, a token, or a provider credential in an API response or log.
6. Feedback is attributed to the authenticated verified user by the server. A browser-submitted email address cannot choose the sender or support recipient.
7. Vercel/Turso remains a Node/libSQL deployment. New routes must pass the existing migration write gate and never fall back to local SQLite in hosted execution.

## Non-goals and forbidden zones

| Forbidden / excluded item | Reason |
|---|---|
| Storing raw token values, mail keys, passwords, or mail bodies in logs | Those are authentication secrets or private learner communication. |
| Implementing inbound-email parsing, magic-link login, OAuth, MFA, or an administrator inbox in this package | They are separate identity/support designs and expand the attack surface. |
| Adding new endpoints under `/api/auth/**` | That namespace is intentionally excluded from the hosted write fence for Auth.js. |
| Marking historical accounts as verified merely to preserve access | That would falsely claim proof of inbox ownership. |
| Sending mail from the client or exposing provider credentials via `NEXT_PUBLIC_*` | The browser must never hold mail-delivery authority. |
| Claiming password reset signs every device out | Existing Auth.js JWT sessions remain valid until expiry; global session revocation is a separate database-session design. |
| Deploying the schema against Production before Plan07's fresh-target and disabled-window gates | Plan07 owns production migration/cutover. |

## Error classification

| Class | Example | Required caller behavior |
|---|---|---|
| VALIDATION | malformed email, short password, empty feedback | return 400 field-safe error; do not create a token/message |
| TOKEN_INVALID | unknown, expired, used, or purpose-mismatched token | return one generic invalid-link result; offer a fresh request path |
| AUTHORIZATION | missing session or unverified identity attempting feedback | return 401/403; do not accept feedback |
| DELIVERY_UNAVAILABLE | missing mail config, Resend timeout/rejection | preserve the safe state, return typed unavailable only where it does not enumerate accounts |
| DATABASE_UNAVAILABLE | libSQL/Turso transport failure | map through the existing opaque 503 response |
| CONFLICT | concurrent consumption of one token | return TOKEN_INVALID; never change a password twice |

## Acceptance evidence

- Static scans show no raw token or mail key is logged, returned, or added to tracked environment files.
- An isolated DB proves reset update and token consumption commit together, including a concurrent/replay attempt.
- Browser tests prove unverified login is blocked and verified login is allowed.
