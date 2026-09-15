# Operations — Migration, deployment and rollback

## Required Vercel configuration

| Variable | Scope | Requirement |
|---|---|---|
| `EMAIL_PROVIDER` | Preview, then Production | exact value `resend` |
| `RESEND_API_KEY` | Secret | server-only, never revealed or committed |
| `EMAIL_FROM` | Config | verified sender identity/domain at Resend |
| `SUPPORT_EMAIL` | Config | controlled support mailbox |
| `AUTH_URL` or `NEXTAUTH_URL` | Config | active Vercel origin used in action links |

Existing `APP_RUNTIME`, Turso and write-mode contracts remain mandatory.

## Deployment sequence

1. Run local migration and tests against a disposable SQLite database only.
2. Create/review the additive SQL migration. It must create only account-token, feedback, indexes, and nullable `emailVerifiedAt` fields.
3. Configure the Preview mail values without inspecting their values. Deploy the exact tested commit with writes disabled and verify read/login presentation.
4. In an explicitly recorded Preview enabled-write window using only a disposable Turso clone, apply the reviewed schema and verify registration → mail delivery → verification → login; then reset; then feedback. No production database or Cloudflare/D1 asset is modified.
5. Restore Preview's intended write fence after evidence. Production follows Plan07 fresh-target/disabled-window/cutover order and needs separate approval.

## Rollback

| State | Required action | Data behavior |
|---|---|---|
| Before Preview schema/write enable | discard only disposable target/deployment | no learner data affected |
| After Preview test writes | retain target for evidence or discard as a disposable clone | no production reconciliation needed |
| Production after token/feedback writes | freeze affected routes and assess target reconciliation | do not silently route authentication back to a pre-schema origin |

## Forbidden operations

- Do not run `prisma migrate reset`, seed, or manual edits against a user database.
- Do not apply this schema to canonical staging or Production outside the recorded window.
- Do not add mail variables to source-controlled files or paste their values into operations evidence.

## Acceptance evidence

- Redacted Vercel configuration names and deployment ID.
- Redacted mail delivery outcome and action-link completion timestamp.
- Pre/post target schema evidence and no raw secret/token in logs.
