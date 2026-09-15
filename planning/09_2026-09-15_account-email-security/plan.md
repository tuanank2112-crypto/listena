# Plan 09 — Account verification, password recovery and learner feedback

- STT: 09
- Created: 2026-09-15 (Asia/Saigon)
- Status: LOCAL ACCEPTED — Vercel Preview mail configuration and disposable-host evidence pending
- Target: 0.7.0 MINOR, after Plan07 hosting gates
- Owner: root orchestrator
- Environments: isolated local SQLite; disposable Vercel/Turso Preview; Production

## Decision log

- 2026-09-15: User requested password recovery, email-account verification, and email feedback after reviewing the login experience.
- 2026-09-15: Credentials authentication remains Auth.js JWT-based. A valid password alone is insufficient for a new account; it must complete a one-time email verification link.
- 2026-09-15: Email delivery is a server-only provider boundary. Resend is the initial hosted transport; no key, raw token, or mailbox credential is committed or logged.
- 2026-09-15: Password-reset requests return one uniform accepted response whether or not an email exists. This prevents account enumeration.
- 2026-09-15: Feedback is a verified learner action, persisted server-side and delivered to configured support email with an acknowledgement to the learner when mail delivery is available.
- 2026-09-15: Registration itself issues the first verification link. A failed mail delivery leaves the new account unverified and reports a safe retry state; the browser does not auto-sign in or create a second initial request.

## Superseded decisions

- None. This package adds account-security scope; it does not replace Plan07's Vercel/Turso cutover, write-fence, or rollback decisions.

## Work packages and model tier

| WP | Owner / tier | Deliverable | Dependency | Status |
|---|---|---|---|---|
| P90 | Root / high | Contracts, schema and migration review | Plan07 runtime contract | DONE — local |
| P91 | Root / high | Token lifecycle, Auth.js verification gate, password-reset APIs | P90 | DONE — local |
| P92 | Root / high | Mail boundary, feedback API and learner pages | P90–P91 | DONE — local |
| P93 | Root / high | Isolated tests, migration proof, Vercel Preview runbook | P90–P92 | DONE — local; hosted evidence pending |

## Execution checklist

- [x] Read current auth, route, schema and deployed-preview constraints.
- [x] Read local Next.js authentication and Route Handler guidance.
- [x] Freeze this spec package.
- [x] Add additive schema/migration, apply it to local development SQLite, and regenerate Prisma client.
- [x] Implement token, mail and feedback contracts with unit/route tests.
- [x] Integrate login, registration, verification, reset and feedback UI.
- [x] Run local acceptance gates without live mail credentials or learner-data writes.
- [ ] Obtain configured Vercel Preview mail secrets and an approved enabled-write test window.
- [ ] Apply only the reviewed additive schema to a disposable Turso Preview target; run hosted verification/reset/feedback evidence.
- [ ] Record Preview evidence and update operational memory. Production remains governed by Plan07.

## Spec router

| Contract | Specification |
|---|---|
| Architecture, invariants and forbidden zones | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| Data, HTTP and mail contracts | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| Security/token/auth implementation | [P91](specs/SPEC-P91-ACCOUNT-SECURITY.md) |
| Delivery, feedback and UI implementation | [P92](specs/SPEC-P92-MAIL-AND-UX.md) |
| Deployment, migration and rollback | [OPERATIONS](specs/OPERATIONS.md) |
| Tests, evidence and exit gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
