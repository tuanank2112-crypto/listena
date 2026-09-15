# P91 — Verification and password-recovery security

## Implementation contract

1. `issueAccountActionToken(userId, purpose)` must generate one raw token, persist only its SHA-256 hash with the stated expiry, and return the raw token only to the caller that immediately composes an email.
2. `consumeVerificationToken(rawToken)` must use an atomic libSQL batch: conditionally set `User.emailVerifiedAt`, then conditionally set `AccountActionToken.consumedAt`. It succeeds only when the first update changes exactly one user.
3. `consumePasswordResetToken(rawToken, newPassword)` must bcrypt-hash the password before the batch. The batch conditionally changes one `User.password`, then consumes the matching reset token. A zero-row password update is `TOKEN_INVALID`.
4. The Credentials `authorize` query selects `emailVerifiedAt`; a correct password on an unverified account throws a `CredentialsSignin` subclass with non-sensitive code `email_not_verified`. Wrong address/password continues to use generic `credentials`. A successful Credentials JWT/session includes `isEmailVerified: true`; Proxy rejects a token lacking that exact claim on protected pages and API requests.
5. Every action-link page posts its token to a Route Handler; it never reads a token from persistent client storage or writes it to analytics/logging.

## Required validation

```ts
VerificationTokenSchema = z.object({ token: z.string().min(43).max(128) })
PasswordResetRequestSchema = z.object({ email: z.string().email().max(320) })
PasswordResetConfirmSchema = z.object({ token: z.string().min(43).max(128), password: z.string().min(8).max(100) })
```

## Forbidden changes

- Do not shorten existing Auth.js session expiry as a substitute for invalidating action links.
- Do not turn an unverified account into a session, even temporarily after registration. Existing JWT sessions are deliberately invalidated by the missing `isEmailVerified` claim and must sign in again.
- Do not make verification/reset token validity depend on a browser cookie, IP address, user agent, or server memory.
- Do not expose whether an email address exists from password-reset endpoints, logs, HTML, timing-oriented message variants, or mail errors.

## Error and caller behavior

| Condition | Service result | Route/UI result |
|---|---|---|
| repeated raw token | `TOKEN_INVALID` | same expired-link screen as unknown token |
| expiry passed | `TOKEN_INVALID` | request another email |
| user deleted after issuance | `TOKEN_INVALID` | request another email |
| correct password, not verified | `EMAIL_NOT_VERIFIED` | explain verification requirement without showing user metadata |
| email sender unavailable on a reset request | delivery recorded only internally | return `202 { accepted: true }` |

## Acceptance evidence

- 32-byte raw token never occurs in DB test queries; only its hash does.
- Reset retry and concurrent consumption produce one password update and one consumed token.
- Login matrix covers unknown credential, wrong password, unverified correct password, and verified correct password.
