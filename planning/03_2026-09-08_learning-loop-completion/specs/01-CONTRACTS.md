# Contracts

## Memory
`getLearnerMemory(userId: string): Promise<LearnerMemory | null>` returns a validated aggregate or null. `appendEvidenceToMemory(tx: Pick<Prisma.TransactionClient, "learnerMemory">, userId: string, evidence: MemoryEvidence): Promise<LearnerMemory>` receives `{ id, skillKey, score, errorType?: string | null }` from the exact newly persisted evidence. Existing goals/preferences survive skill/error updates. The session transaction's unique clientTurnId is the idempotency boundary; no separate speculative storage system.

## Recommendation
`computeNextAction(userId: string, sessionId?: string): Promise<NextAction | null>`; type retains `kind: "COACH" | "MISSION" | "QUEST" | "PRACTICE"`, optional `targetId`, `reason: string`, `evidenceRefs: string[]`.
`GET /api/learning-sessions/:id`, `POST /:id/turns`, `POST /:id/complete` retain current fields and add nextAction when session is completed. All session reads remain owner-scoped. CTA creates a session with existing `POST /api/learning-sessions` for COACH/MISSION/QUEST; PRACTICE opens existing remediation UI. No server modules imported at runtime in client components.

## Timeline
`getLearnerTimeline(userId: string, windowDays: 7 | 30 = 7): Promise<LearnerTimeline>`, where `LearnerTimeline = { items: TimelineItem[]; weeklyStudyTime: number }`.
`TimelineItem = {kind: "SESSION" | "EVIDENCE" | "ATTEMPT" | "REVIEW"; id: string; createdAt: string; score?: number; skillKey?: string}` (additive safe display fields permitted).
`GET /api/learner/timeline?window=7d|30d` returns owner-only items sorted descending, max 50. weeklyStudyTime always covers completed sessions in trailing seven days through now, independent of item limit and selected display window. Keep existing per-session 1–120 minute accounting consistent with completion; do not alter historical storage.

## TTS
`POST /api/tts/vie` and `GET /api/tts/vie` require authenticated user before fetch/cache operations. Sidecar `POST /tts`, `GET /voices` require configured `X-TTS-Key` matched safely; missing configuration must fail closed. Docker binds the local sidecar port to loopback by default. Preserve existing request/response shapes for authenticated callers.

## MUST / MUST NOT and forbidden areas
- MUST validate missing/unavailable recommendation targets and use an existing deterministic fallback; MUST NOT fabricate lesson or evidence IDs.
- MUST ground reasons in actual owned evidence/skills/due vocabulary and preserve no-evidence null behavior.
- MUST NOT filter learner curriculum by a display title; use existing published-status contracts, retaining draft exclusion.
- MUST NOT expose raw memory, acceptedAnswers, correctIndex, provider secrets or arbitrary redirects.

## Error matrix
| Error | Caller behavior |
|---|---|
| Invalid timeline window | HTTP 400; UI shows retryable error |
| Empty timeline | HTTP 200, empty items, zero weekly total |
| Missing next-action target | Valid PRACTICE fallback, warning; no broken navigation |
| Missing user session | HTTP 401 |
| Sidecar missing secret | Fail closed with service unavailable response |
| Sidecar wrong/missing key | HTTP 401/403; no model/cache access |

## Acceptance evidence
Required tests: branch/ownership/target validation, memory corrupt entries/idempotency/rollback, timeline >50 sessions and date bounds, API authorization, debrief CTA after reload and auto-completion. Baseline counts in TESTING-ACCEPTANCE; final numbers pending execution.
