# Contracts — Data, HTTP and mail

## Additive data contract

```prisma
enum AccountActionPurpose { VERIFY_EMAIL PASSWORD_RESET }
enum FeedbackDeliveryStatus { PENDING SENT EMAIL_UNAVAILABLE }

model User {
  emailVerifiedAt DateTime?
  accountActionTokens AccountActionToken[]
  feedbackMessages FeedbackMessage[]
}

model AccountActionToken {
  id        String @id @default(uuid())
  userId    String
  purpose   AccountActionPurpose
  tokenHash String @unique
  expiresAt DateTime
  consumedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, purpose, createdAt])
  @@index([purpose, expiresAt])
}

model FeedbackMessage {
  id             String @id @default(uuid())
  userId         String
  subject        String
  message        String
  deliveryStatus FeedbackDeliveryStatus @default(PENDING)
  createdAt      DateTime @default(now())
  deliveredAt    DateTime?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
}
```

`tokenHash` is `sha256(rawToken)` encoded as lowercase hex. Raw tokens are 32 random bytes encoded with base64url. Verification tokens expire in 24 hours; reset tokens expire in one hour.

## Route contracts

| Endpoint | Request | Success | Failure contract |
|---|---|---|---|
| `POST /api/account/verification/request` | `{ email: string }` | `202 { accepted: true }` | `400` only malformed input; never reveal account existence or delivery state |
| `POST /api/account/verification/confirm` | `{ token: string }` | `200 { verified: true }` | `400 { code: "TOKEN_INVALID" }` for all invalid/expired/used links |
| `POST /api/account/password-reset/request` | `{ email: string }` | `202 { accepted: true }` | `400` only malformed input; never reveal account existence or delivery state |
| `POST /api/account/password-reset/confirm` | `{ token: string, password: string }` | `200 { passwordReset: true }` | `400 TOKEN_INVALID` or field-safe validation error |
| `POST /api/feedback` | session plus `{ subject: string, message: string }` | `201 { id, delivery: "sent" }` or `202 { id, delivery: "unavailable" }` | `401` unauthenticated, `403 EMAIL_NOT_VERIFIED`, `400` validation, opaque `503` DB failure |

All responses set `Cache-Control: no-store`. Routes must validate JSON with Zod before database work. Email addresses are trimmed and lowercased at every registration, authentication and action-request boundary.

## Mail delivery contract

```ts
type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

interface EmailDelivery {
  send(message: OutboundEmail): Promise<{ provider: "resend"; messageId: string }>;
}
```

`EMAIL_PROVIDER=resend` selects a server-side POST to `https://api.resend.com/emails`; another explicit provider value is rejected. `RESEND_API_KEY` and `EMAIL_FROM` are required for all mail, and `SUPPORT_EMAIL` is required for feedback notification. `EMAIL_REPLY_TO` is optional. Public action links derive their origin from `AUTH_URL` then `NEXTAUTH_URL`. Any missing/invalid configuration yields `EmailDeliveryUnavailableError`, never a partial fake delivery.

## Caller error matrix

| Error code | HTTP | Caller behavior |
|---|---:|---|
| `TOKEN_INVALID` | 400 | render link-expired/used state and offer a new request |
| `EMAIL_NOT_VERIFIED` | 403 | render resend-verification action |
| `EMAIL_DELIVERY_UNAVAILABLE` | 503 or typed `delivery: "unavailable"` as specified above | show non-secret retry guidance; do not reveal raw link |
| `DATABASE_CONFIGURATION_MISSING` / `DATABASE_UNAVAILABLE` | 503 | use existing generic database message |

## Acceptance evidence

- Route tests assert exact status, schema and non-enumeration response bodies.
- Mail-boundary tests assert request authorization, JSON payload shape, and that provider error text is not exposed.
