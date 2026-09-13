# Operations and release contract

Status: LOCAL IMPLEMENTATION + LOCAL ACCEPTANCE COMPLETE. This file does not authorize a deployment, paid provider usage, hosted data migration, cutover, rollback exercise or learner recruitment. Preview/Production/live-provider/pilot gates remain OPEN.

## Environments / ordered procedure

1. Root records source commit, dirty paths, spec revision, exclusive WP file ownership and baseline commands. Preserve existing user edits. Read relevant `node_modules/next/dist/docs/` before changing framework code.
2. P81 was developed and fault-tested on a fresh isolated SQLite DB, never the user's local learning DB. The schema changes are additive; their local validation does not apply them to a hosted target.
3. P82/P83 were integrated against frozen DTOs; P84 prepared and ran offline cases independently. Root integrated at the shared schema/memory/session boundaries, then reran the full local gate.
4. Follow [Plan07 operations](../../07_2026-09-10_vercel-turso-migration/specs/OPERATIONS.md) for disposable Turso clone + protected Preview; canonical imported staging is not test-write storage. Record project/deployment/DB identity and fence mode without secrets.
5. Fence disabled first: fresh auth/read checks and normalized app-table fingerprint before/after all GET/render paths. Apply approved additive migration to clone only. Enable writes in bounded clone window for P81 concurrency/ownership and P82/P83 flows. Restore disabled even on test failure, verify fingerprint again.
6. Successful live provider check only with configured access and approved bounded budget, after hosting prerequisites. Cap release-smoke at10 live calls with sanitized synthetic content, stop on unexpected billing/latency/config failure. Do not change plans/subscriptions or expose credentials. Provider unavailable keeps gate OPEN, not passed.
7. Production must follow Plan07 explicit final-export/cutover approval and reconciliation rules. Do not silently promote this local implementation task into D1/DNS/traffic changes. Release0.7.0 remains proposed until its hosted and pilot gates pass; current version stays unchanged.

## Local acceptance record (2026-09-13)

On a fresh isolated SQLite sandbox: `npm test` passed 387/387 tests in 78 files; type-check passed; lint exited 0 with 34 pre-existing warnings; Prisma validate/generate passed; production build passed; full `npm run test:e2e` passed 20/20; and the offline quality runner passed 30/30 cases and 12/12 dataset checks. The E2E setup creates its own temporary database and does not reset or seed user data. This record has no Vercel deployment ID, Turso target, provider call, production mutation, cutover, rollback drill or pilot artifact.

## Rollout / rollback contract

Deploy start-key schema before code; required clientStartId affects old clients. Keep write fence disabled during client/server switch, request a refresh for old clients receiving400, then enable only after synthetic smoke. Do not temporarily accept missing keys just to avoid refresh.

Before any new-target writes: revert code to last accepted build while keeping additive schema; revalidate config and reads. After new-target writes: disable writes, snapshot evidence, reconcile before switching databases. CẤM dropping new tables, resetting/seeding target, reverting migration destructively, or routing to stale D1 without reconciliation. UNKNOWN start records are retained for investigation, never retried en masse.

## Artifact contract

Each run records `{commit, specRevision, environment, deploymentId?, databaseAlias, fenceMode, commands, results, startedAt, finishedAt, redactedArtifactPaths}`. Fingerprints cover all application tables and exclude nondeterministic ordering only; changes to recommendation timestamps count as writes. Auth cookies are outside DB fingerprint, not a reason to skip app-table proof. Secrets, full provider payloads and real learner answers are excluded from logs/report.

## Errors / operator response

| Class | Response |
|---|---|
| Unknown DB target or missing env | Stop write operation; read-only verification, no local fallback |
| Disabled-window fingerprint changes | Fail release gate, preserve diff, investigate source; restore fence, no claim read-only |
| Partial account/session graph | Fail and keep Preview isolated; capture counts/integrity, no reset to hide evidence |
| Provider failure/unknown billing | Stop live run, typed unavailable, do not rotate providers secretly |
| Gate lacks artifact | Treat as pending; root cannot accept verbal pass |

## Acceptance

Actual: Plan07 has historical bounded Preview evidence, not full acceptance. Plan08 local implementation adds a recommendation GET all-application-table fingerprint and local replay/ownership/migration tests, but no hosted clone was exercised. Before release, required evidence is exact commit traceability, zero app-table deltas in a disabled hosted-read window, replay/owner proof on a disposable clone, fence restoration after tests, and an independently checked rollback procedure. Local/Preview/Production/pilot statuses remain separate in TESTING-ACCEPTANCE.
