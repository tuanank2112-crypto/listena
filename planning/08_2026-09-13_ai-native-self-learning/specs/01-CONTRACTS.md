# Shared contracts — revision 1, implemented locally

These contracts are implemented and locally verified. Root must record a new revision before changing them. Their local implementation does not authorize Preview/Production writes, cutover, live-provider use or a pilot.

## Learner intent

`GET /api/learner/intent` → 200 `{goal: string|null, dailyMinutes: 5|10|15|20, preferredTopics: string[], revision: string|null}`.

`PUT /api/learner/intent` body same shape; goal trimmed3–240 chars or null; topics unique trimmed1–40 chars, max8; revision is an opaque snapshot token, null only for absent memory. Authenticated user ID comes exclusively from session. Success200 returns canonical intent plus new revision. Unspecified settings preserve other memory fields. Defaults: goal null,10minutes, topics from profile for compatibility.

Storage: existing `LearnerMemory.preferencesJson` keys `selfStudyGoal` (string|null), `dailyMinutes` (number), `preferredTopics` (string[]). Do not overwrite evidence-derived `goalsJson`, errors or skills. Revision is a hash of the exact existing memory snapshot used by the conditional write; use existing atomic memory fence conventions. On absent memory, unique userId handles competing inserts. Explicit empty topics clears legacy `LearnerProfile.preferredTopics` in the same batch; planner prefers explicit memory setting over profile fallback. Round-trip compatibility required with current bounded preference parser.

## Learning decision

```ts
type EvidenceRef = { source: "LEARNING" | "ADAPTIVE"; id: string };
type SkillObservation = {
  skillKey: string;
  score: number | null; // finite 0..1 only when evidenceCount > 0
  evidenceCount: number;
  status: "UNKNOWN" | "PROVISIONAL" | "CALIBRATED";
};
type LearningDecision = {
  kind: "RESUME" | "CALIBRATE" | "COACH" | "MISSION" | "QUEST" | "PRACTICE" | "REVIEW" | "EMPTY";
  targetId?: string;
  scenarioKey?: string;
  goal?: string;
  reasonCode: "ACTIVE_SESSION" | "NO_EVIDENCE" | "RECURRING_ERROR" | "DUE_REVIEW" | "SKILL_PRACTICE" | "GOAL_PRACTICE" | "NO_CONTENT";
  reasonVi: string;
  evidenceRefs: EvidenceRef[]; // <=12, dedup (source,id), owner validated
  estimatedMinutes: 5 | 10 | 15 | 20;
  decisionVersion: "p08-v1";
};
```

`GET /api/learner/next-action` → 200 `{decision: LearningDecision}`; no DB writes/provider calls. `RESUME` requires owned active session targetId; `COACH` requires published lesson targetId; `MISSION/QUEST/PRACTICE` require valid scenarioKey; `CALIBRATE` launches an eligible server-scored practice with displayed purpose, not a fake session mode; `REVIEW` goes to existing due flashcards; `EMPTY` has no executable target. Execution revalidates target rather than trusting stale decision.

Current `NextAction` DTO remains backward compatible for current consumers until migrated together. Legacy `evidenceRefs: string[]` must not receive mixed-source IDs. New LearningDecision is consumed by dashboard and debrief through an explicit adapter; retain old DTO for older callers until a reviewed removal.

Read adapters: `LearningEvidence` joins `LearningSession.userId`; `AdaptiveEvidence` filters its userId. Preserve scorer provenance; do not double-apply mastery or rewrite source rows. Self-reported flashcard review may prioritize due work, but is not promoted into server-scored calibration evidence.

## Error envelope and mandatory caller behavior

`{error: string, code: string}`; errors opaque, no driver output/secrets. Existing endpoint success shapes remain except explicit additions above and start contract in P81.

| HTTP/code | Caller |
|---|---|
| 400 INVALID_INPUT | Inline field error; no blind retry |
| 401 UNAUTHORIZED | Login then restore safe intended action |
| 404 NOT_FOUND | Drop stale/private target; refresh decision |
| 404 TARGET_UNAVAILABLE | Preserve intent/draft, refresh the planner; do not fabricate a replacement session |
| 409 INTENT_CONFLICT | Reload canonical intent; retain unsaved input, do not silently overwrite |
| 409 IDEMPOTENCY_CONFLICT | Do not retry changed payload under same key |
| 409 ACTIVE_SESSION_EXISTS | Discard the terminal start key and direct the learner to the owned dashboard/session; do not start another primary session |
| 409 START_IN_PROGRESS / START_OUTCOME_UNKNOWN | Follow P81; preserve key/input |
| 429 AI_RATE_LIMITED | Respect Retry-After; no auto new request identity |
| 503 MIGRATION_WRITE_DISABLED / AI_UNAVAILABLE / DATABASE_UNAVAILABLE | Keep user input, display specific retry state; never record success |

## BẮT BUỘC / CẤM and proof

BẮT BUỘC runtime validation at API and provider boundaries; exact snapshot conditional writes for memory; no global calibration claim for a skill with zero evidence. CẤM change historical numeric priors into measured results or invalidate existing memory JSON. Local proof includes intent/CAS and observation tests, planner and start-contract tests, the all-application-table recommendation GET fingerprint, plus the 387-test/78-file suite and isolated E2E 20/20. Hosted ownership/retry proof, fresh HTTPS auth, live-provider behavior and pilot evidence are still unrun.
