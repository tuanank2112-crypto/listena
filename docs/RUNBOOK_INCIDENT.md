# ListenAI — Production Incident Response Runbook

This runbook defines the emergency response procedures for the 4 critical incident scenarios in ListenAI production environments (Vercel, Turso libSQL, AI providers, Email).

---

## 1. Incident Scenario A: Database Unavailable (`DatabaseUnavailableError`)

### Symptoms
- 500 / 503 HTTP responses across authenticated routes.
- Pino structured logs reporting `DatabaseUnavailableError` or libSQL connection errors (`SQLITE_BUSY`, network timeout to Turso).

### Immediate Remediation
1. **Engage Maintenance Fence (Read-Only Mode):**
   - In Vercel Environment Variables, set:
     ```env
     MIGRATION_WRITE_MODE=disabled
     ```
   - Redeploy or trigger configuration reload. This immediately blocks destructive mutations and serves safe 503 / read-only fallback notices.
2. **Turso Health Inspection:**
   - Check Turso cluster status via CLI:
     ```bash
     turso db show <database-name>
     ```
   - If Turso is reporting region outage, failover to replica region if configured.
3. **Local File-backed SQLite Fallback (Disaster Recovery):**
   - If Turso primary is unrecoverable, restore latest verified daily backup using `scripts/verify-backup-restore.ts` to a standby database and redirect `DATABASE_URL`.
4. **Disengage Fence:**
   - Once database connectivity and health checks return HTTP 200, restore:
     ```env
     MIGRATION_WRITE_MODE=enabled
     ```

---

## 2. Incident Scenario B: AI Provider Outage or Rate Limit (`AIUnavailableError`)

### Symptoms
- Tutor turn generation returns 503 or `AIUnavailableError`.
- Lesson generation on teacher portal hangs or fails.
- Logs show HTTP 429 (`rate_limited`) or 502/503 from OpenAI/Kira provider.

### Immediate Remediation
1. **Verify Circuit Breakers & Cooldowns:**
   - The application enforces per-user cooldowns (12s mission, 30s teacher generation) and 40 calls/24h budget reservations.
   - Confirm whether the outage is a global provider failure or organization quota exhaustion.
2. **Failover to Alternate Provider:**
   - Switch active provider via environment configuration without code change:
     ```env
     AI_PROVIDER_DEFAULT=kira  # or openai
     ```
3. **Graceful Fallback Mode:**
   - The UI automatically falls back to typed contextual support:
     - Pre-authored lessons and dictation exercises remain 100% playable without live AI.
     - Flashcard spaced repetition (SM-2) operates independently of AI provider availability.

---

## 3. Incident Scenario C: Email Delivery Outage (Verification / Password Reset)

### Symptoms
- Learners report not receiving email verification links or password reset tokens.
- Logs show Resend or SMTP connection errors.

### Immediate Remediation
1. **Check Delivery Provider Quota:**
   - Inspect Resend / SMTP console for bounce rates or daily sending limits.
2. **Emergency Manual Account Verification (Operator Tool):**
   - Operators can manually verify an account using the server admin script:
     ```bash
     npx tsx scripts/manual-verify-user.ts --email learner@example.com
     ```
   - Invariant: Never disclose raw passwords or reset tokens in logs or public communication.
3. **Switch to Backup SMTP Relay:**
   - Update `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` in Vercel project settings.

---

## 4. Incident Scenario D: Secret Key Leak / Compromise

### Sentry / Detection
- Automated secret scanning (e.g. GitHub Secret Scanning) detects exposed `NEXTAUTH_SECRET`, `TURSO_AUTH_TOKEN`, or provider API key.

### Immediate Remediation
1. **NextAuth / Session Secret Rotation:**
   - Generate a new 32-byte secret:
     ```bash
     openssl rand -base64 32
     ```
   - Update `NEXTAUTH_SECRET` in production. This immediately invalidates all active JWT sessions, requiring users to log in again.
2. **Database Token Rotation:**
   - In Turso CLI, invalidate the leaked token and mint a new one:
     ```bash
     turso db tokens revoke <token-id>
     turso db tokens create <database-name>
     ```
   - Update `TURSO_AUTH_TOKEN` in Vercel.
3. **AI Provider Key Revocation:**
   - Immediately delete the compromised key in OpenAI / Kira developer console.
   - Issue a replacement key with hard spending caps and update `OPENAI_API_KEY`.
4. **Audit Trail Inspection:**
   - Inspect query and login logs over the last 48 hours for unauthorized IP addresses or abnormal mutation bursts.
