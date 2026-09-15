# P92 — Delivery, feedback and account UI

## Mail templates

| Template | Recipient | Required link / content |
|---|---|---|
| Verify account | learner | `/verify-email?token=<raw>` and 24-hour expiry notice |
| Reset password | requested address | `/reset-password?token=<raw>` and one-hour expiry notice |
| Feedback acknowledgement | verified learner | receipt confirmation without repeating submitted feedback |
| Feedback notification | `SUPPORT_EMAIL` | verified learner display name/email, subject and message; the persisted feedback ID supplies the delivery idempotency key |

Templates must be plain Vietnamese-first text plus safe HTML. They must not include passwords, token hashes, API keys, or full feedback in the acknowledgement.

## UI contract

- `/register` creates the learner account, displays a “check your inbox” state, and does not call `signIn` until verification succeeds.
- `/login` has a visible “Quên mật khẩu?” link. `email_not_verified` explains that verification is needed and offers a dedicated resend-verification action; password recovery remains separate.
- `/verify-email?token=…` submits the token once and gives a clear verified, expired, or already-used outcome.
- `/forgot-password` always confirms that an email will be sent if eligible, with no account-existence disclosure.
- `/reset-password?token=…` requires new-password confirmation and returns to login only after the server confirms the atomic reset.
- `/feedback` is authenticated and verified-only, with subject and message fields. It acknowledges storage even if delivery is temporarily unavailable.

## Error handling

| UI state | Required copy behavior |
|---|---|
| Invalid/expired action link | state that link cannot be used and offer a request action |
| Mail delivery unavailable | say mail is temporarily unavailable; never present a raw link or provider detail |
| Feedback stored, email pending | say feedback was recorded and support notification will retry/needs attention; do not claim it was mailed |
| Unverified learner feedback request | guide to verification; do not render a send button |

## Forbidden zones

- Do not automatically resend on page load or use an unbounded resend loop.
- Do not autocomplete or preserve reset passwords, reset tokens, or feedback text in logs/analytics.
- Do not let unauthenticated feedback choose a reply-to address or submit arbitrary `to`/`from` fields.

## Acceptance evidence

- Browser/local route tests demonstrate each success and error state.
- Accessibility checks find associated labels, live error status, keyboard-usable buttons, and no password reveal by default.
