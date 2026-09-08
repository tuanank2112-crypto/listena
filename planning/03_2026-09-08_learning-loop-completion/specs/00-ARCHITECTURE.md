# Architecture

## Contract
`submitLearningTurn(userId, sessionId, input)` commits learner turn, AI turn, LearningEvidence, SkillMastery, LearnerMemory and state in one Prisma transaction. AI evaluation remains outside that transaction. Completed session envelopes expose optional `nextAction: NextAction | null`; authenticated reads recompute it so reload and automatic completion retain navigation. Timeline aggregation is a server service shared by server-rendered dashboard and authenticated timeline API.

## MUST / MUST NOT
- MUST preserve ownership, clientTurnId idempotency, server intervention grading, private validators and existing speech fallback.
- MUST use exact newly created evidence for memory. MUST NOT query arbitrary latest evidence after commit.
- MUST show a grounded next action when a completed session has usable evidence.
- MUST NOT rewrite framework, database provider, grading engine or authored mission system. These are intentional boundaries, not unfinished work.
- MUST preserve SQLite and existing migrations. New writes must not corrupt existing JSON memory.

## Errors and caller behavior
| Class | Required behavior |
|---|---|
| Memory write/storage failure | Fail transaction; no partial successful turn |
| Malformed memory JSON/entries | Sanitize invalid entries, log structural warning, continue with valid context |
| Duplicate turn | Return existing result without new evidence/memory increment |
| Optional recommendation unavailable | Log error; preserve completed session and return null or valid deterministic fallback |
| Unauthorized access | Reject before DB/TTS work |

## Evidence
Baseline 2026-09-08: 106/106 tests in 27 files; type-check PASS; lint 0 errors/38 warnings. Final regression evidence is recorded in TESTING-ACCEPTANCE; not yet accepted.
