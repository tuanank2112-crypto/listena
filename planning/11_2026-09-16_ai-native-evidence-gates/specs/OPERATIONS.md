# Operations — Plan11

## Execution and operational contract

1. Boot `init_brain.js <repo> --check`; read current Plan11 plus Plan07/09. Snapshot branch/commit/diff. Preserve user artifacts and databases.
2. P110 freezes exact additive fields, result DTO/versioning, mastery/enrichment guards, schema owner and file ownership. Read relevant local Next guides before framework code changes. P111/P112 implementation starts only after those choices are exact and recorded; no competing schema migrations.
3. Apply candidate migration only to freshly created isolated SQLite fixtures; no seed/reset on current dev.db. Inspect old-row nullable compatibility, FK/integrity and fault fingerprints. Reproduce all mutation/UI cases locally.
4. Run actual CI candidate, capture run URL/headSha/conclusion and artifacts; workflow creation is not this gate. Local npm ci reproduction uses a separate checkout if needed to avoid replacing the user's active dependencies.
5. Prepare bounded hosted test manifest: exact candidate, disposable clone name/fingerprint, scenario accounts, allowed endpoints, provider/mail scope, call/cost cap, enabled-window duration, restore-fence command and readback verification. Use permissions already granted by user; if new approval is necessary, request only after this manifest and local candidate are reviewable. Plan07/09 remain authoritative.
6. Hosted window: confirm clone≠canonical staging/Production; enabled-window tests/readback; always restore `MIGRATION_WRITE_MODE=disabled`, redeploy/readback and all-table read fingerprint. No staging promotion, D1 reset/seed, secret output or final export/cutover in Plan11.
7. Run P115 permitted live smoke/reviewer suite on exact candidate, then P116 only after consent/segment/reviewer/budget inputs. Production is not required for a controlled Preview pilot, but account/mail, ownership, data protection and permitted access must be proven there first.

## Ledger and rollback

Each handoff uses `AcceptanceReceipt` from01-CONTRACTS and links contract case IDs to non-sensitive artifact/readback. Root owns final acceptance. Candidate changes after a run invalidate affected gates; no wholesale rerun without relevant changes/failures.

Local rollback uses isolated fixture recreation or candidate revert, never database reset of user's data. Additive schema rollback retains nullable compatible columns; do not DROP populated fields. A deployed app rollback may only select a candidate compatible with the actual schema. After hosted writes, data reconciliation is mandatory before Cloudflare rollback under Plan07; no naive traffic flip. Firewall/mail rollback remains original runbook owner and version.

## Mandatory and forbidden

- BẮT BUỘC record approval source/scope for hosted actions in decision log; do not infer historical authorization from a commit/report alone.
- BẮT BUỘC follow existing permission grants without repeatedly asking. New live spending/pilot/public cutover must match actual session authorization.
- CẤM inspect secret values, emit connection tokens, log raw learner data, deploy from dirty unrelated changes or auto-enable writes as part of build.
- CẤM declare Ready/fence-variable presence as verified read-only behavior or close live/mail gate from typed unavailability.

## Error/caller matrix and evidence

| Failure | Operator behavior |
|---|---|
| CI inaccessible/no run URL | mark UNVERIFIED; do local work, do not claim CI failure/success |
| Migration/fixture integrity failure | stop candidate acceptance; inspect isolated DB only |
| Hosted scope/config missing | leave fence disabled; prepare local evidence/manifest |
| Restore fence uncertain | do not close window; verify deployment and DB fingerprint before any further write test |
| Unknown provider outcome | record UNKNOWN, no automatic spend; reconcile intent |
| Pilot severe correctness/privacy defect | stop study collection under consent protocol; preserve safe evidence for remediation |

Review evidence: gh CLI unauthenticated; no remote run checked. Historical Plan10 reports deployed Ready/schema31tables56indexes, not rerun. Required new measurements: exact CI run success; bounded clone mutations/counts/fingerprints; final disabled mutation rejection plus login/read all-table fingerprint unchanged; no secrets in artifacts. Final-export/Production/cutover/rollback gates remain OPEN until Plan07-specific evidence.
