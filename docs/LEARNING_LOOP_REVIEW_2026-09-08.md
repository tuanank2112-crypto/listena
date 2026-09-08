# Learning loop review — 2026-09-08

## Scope and evidence
The user authorized autonomous completion of existing unfinished architecture. Root and two Terra High survey agents traced session APIs, server grading, transactions, learner memory, next-action computation and client reducers; a third implementation agent owns shared timeline/curriculum work. Existing uncommitted changes were retained. Baseline executed this session: brain check PASS; Vitest 106/106 in 27 files; TypeScript PASS; ESLint 0 errors/38 warnings; Prisma schema validate PASS.

Current implementation and final gates are tracked in [Plan 03](../planning/03_2026-09-08_learning-loop-completion/plan.md). This review is not a production deployment approval.

## Findings and decisions
| Priority | Finding at start | Classification | Required result |
|---|---|---|---|
| P1 | Memory updated outside turn transaction using latest session evidence; errors swallowed | FIX NOW | Exact evidence and memory commit together; rollback/idempotency regression |
| P1 | Fake conversation role cast used to inject memory into tutor context | FIX NOW | Typed bounded learner context, no raw-memory public DTO |
| P1 | Next-action response discarded by session player; generic debrief links | FIX NOW | Grounded action survives auto/manual completion and reload; valid next activity starts |
| P1 | Coach recommendation chooses arbitrary oldest published lesson | FIX NOW | Evidence/context-based valid target or deterministic fallback |
| P1 | Public Next TTS API and sidecar lacked authentication | FIX NOW | User auth, fail-closed shared key, loopback default binding |
| P2 | Timeline endpoint had no learner UI consumer and capped aggregate at 50 sessions | FIX NOW | Shared service; complete 7-day aggregate; dashboard/progress integration |
| P2 | Curriculum pages hard-code a course's display title | FIX NOW | Published content remains visible after course rename; drafts remain hidden |
| P2 | Render PostgreSQL configuration conflicts with SQLite schema/migrations | DEFERRED | Dedicated production provider/migration/backup plan; no deployment here |
| P2 | Legacy attempt/review writes and concurrent review schedules need broader transaction audit | DEFERRED | Separate scoped persistence hardening; no speculative rewrite in this session-loop patch |
| P2 | Real-provider educational outcomes, speech quality, quotas and latency not validated | DEFERRED | Real-service and learner evaluation, separate from deterministic local tests |
| P3 | Historical version/status docs disagree with source | FIX NOW | Update active router, version metadata and concrete acceptance evidence |
| P3 | Existing unused-symbol lint warnings and legacy Kokoro artifacts | DEFERRED | No broad cleanup or model download |
| — | Server validators, deterministic recommendation, authored missions, SQLite | INTENTIONAL | Preserve existing architecture |

## Verification boundary
Local E2E uses the existing guarded temporary SQLite setup and mock tutor. Tests must cover exact memory/evidence linkage, failed-memory rollback, duplicate requests, recommendation targets/navigation, timeline ownership/date bounds and renamed curriculum. Auth tests for TTS run without downloading or invoking VieNeu. Local tests cannot demonstrate educational effectiveness or production infrastructure readiness.
