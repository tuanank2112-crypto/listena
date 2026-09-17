# Testing and acceptance — Plan11

## Evidence contract

Every PASS requires `AcceptanceReceipt` (01-CONTRACTS), candidate SHA, command/exit, exact assertion/readback counts, artifact path/hash and reviewer. UNVERIFIED is different from FAIL. Future thresholds below are not already measured results. No test count substitutes for assertion strength.

## Fresh review evidence, 2026-09-16

| Check | Actual result | Scope |
|---|---|---|
| Brain --check |exit0; compliant1.7.2/1.4.0 |structural brain only |
| Unit |437/437,87files,13.00s |existing assertions; not repair acceptance |
| Type-check |exit0 |current source |
| Quality dry-run |30/30,12/12 |dataset structural contracts |
| Current review SQL, in-memory |changes[1,0], logs1, revision1, schedule2000 |FAIL intended stale-review invariant |
| Teacher UI-shaped payload / actual Zod |manual=false; AI=false; missing clientRequestId |FAIL integrated payload contract |
| Current hash/elapsed retry |attempt=true; review=true for changed hash |FAIL retry stability if payload recomputed |
| CI remote |UNVERIFIED; gh unauthenticated |workflow file exists |
| Build/lint/E2E/Python/audit/hosted |historical Plan10 only |not rerun here |

## Mandatory matrix

| ID | Case / measured invariant | Local | CI | Preview |
|---|---|---|---|---|
| T111-01 |20 same-key attempt/review requests,1receipt/core graph;0generic500; exact payload replay |⬜ |⬜ |⬜ bounded |
| T111-02 |stale review loser logs/deltas=0; correct winner schedule/revision |⬜ realDB |⬜ realDB |⬜ |
| T111-03 |20distinct attempts, counters20, mastery equivalent to valid serial commit order |⬜ |⬜ |⬜ bounded |
| T111-04 |mixed attempt/review same vocabulary: revision guards all writers, no stale overwrite |⬜ |⬜ |⬜ |
| T111-05 |first/replay deep equality, including later reviews/unpublish and AI terminal status |⬜ |⬜ |⬜ |
| T111-06 |lost response + reload, body/key identical; one commit; explicit edited intent handled |⬜ UI E2E |⬜ |⬜ |
| T112-01 |actual teacher page manual+AI payload valid, successful owned creation/navigation |⬜ UI E2E |⬜ |⬜ permitted provider |
| T112-02 |fault every course/catalog/graph/trace/receipt/ledger statement: no partial graph |⬜ realDB |⬜ realDB |⬜ selected |
| T112-03 |FAILED recovery race,expired PENDING,setup/quota/timeout/settlement: one dispatch or UNKNOWN |⬜ counters/readback |⬜ |⬜ bounded |
| T112-04 |all-non-target vocabulary publish409; role/owner/opaque error canaries |⬜ |⬜ |⬜ |
| T114-01 |100%causally matched owned refs; no unrelated skill citations; target revalidation |⬜ |⬜ |⬜ |
| T114-02 |planner GET provider0/writes0, all-table fingerprint; goal/context→comeback→next action/reload |⬜ |⬜ |⬜ |
| T115-01 |≥12multi-turn actual runtime cases, ≥4per mode, ≥3learner turns each |⬜ |⬜ |n/a |
| T115-02 |bounded live outputs + complete two-reviewer severe-error review; frozen rubric thresholds |n/a |n/a |⬜ |
| T116-01 |consent, counts/attrition, paired unassisted transfer and7day delayed values |n/a |n/a |⬜ pilot |

Real DB cases use fresh SQLite and actual service/SQL execution; transport/provider stub only at external boundary. Do not mock `executeAtomicLibSqlBatch` for transactional proof. At each fault compare affected table fingerprints and counters, not just exception. Old schema rows are fixture input; nullable snapshots do not cause startup/history failures. Every expected changed/unchanged field is asserted; hash/replay tests cannot catch conflict and then pass.

## Regression gates

After implementation: all existing437unit and20E2E scenarios plus necessary new cases pass; type-check0errors; lint0errors/no new changed-file warnings above historical33; standard Next build; Prisma validate+fresh migration; Python7boundary tests if touched or full CI; structural30/30+12/12 retained. Coverage must be measured on same command and reported numerically for changed integrity/planner modules; no threshold claim without baseline artifact. Runtime audit0reachable high/critical or dated approved non-runtime exception. No real model download in boundary tests.

## Exit gates by environment

- ✅ review/planning: brain/source/report review, fresh bounded baseline, probe, package and brain synchronization.
- ⬜ local integrity/UI: T111/T112 all exact invariants pass; P102/P103/P106 requalification recorded.
- ⬜ local loop/runtime eval: T114/T115-01 pass; user segment assumption clearly recorded.
- ⬜ CI: real candidate run URL/SHA/conclusion plus retained artifact checks; workflow creation alone insufficient.
- ⬜ Preview disabled: current candidate deployed, authenticated read all-table fingerprint unchanged and mutations rejected/no rows.
- ⬜ Preview enabled: permitted clone retry/owner/mail/WAF/live invariants from Plan07/09/10 proven, fence restored.
- ⬜ live/reviewer: T115-02 output quality, severe errors0, owner/validator invariants100%; failure/missing denominators reported.
- ⬜ pilot: user inputs+consent, T116-01 report; evaluation outcome may require product changes before release recommendation.
- ⬜ Production/export/cutover/rollback: external Plan07 authority, no claim by Plan11.

Plan11 can be local-complete without pretending hosted/pilot complete. It cannot close its full product evaluation scope while required live/reviewer/pilot gates remain open. Version bump/release requires relevant release environment gates and root decision.

## Forbidden zone and failure/caller matrix

CẤM skip failing assertions, report mocked transaction as rollback proof, overwrite user's eval/report.md, reuse user's DB/dev server, fabricate reviewer score/provider usage/learning gain, or auto-close environment from another environment's evidence.

| Failure | Required acceptance behavior |
|---|---|
| Contract invariant fails despite green suite |FAIL affected WP; improve meaningful assertion then repair code |
| Artifact/log unavailable |UNVERIFIED; retain historical record, no new PASS |
| New candidate after verification |invalidate affected gates only; rerun appropriate cases |
| Severe teaching error |block pilot readiness; remediate+review |
| Pilot shows no gain/attrition |report actual outcome; no fabricated pass/efficacy claim |
