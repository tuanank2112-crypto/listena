# P42 — Evidence-qualified completion and truthful debrief

## Contract

`completeLearningSession` checks owned learner evidence inside its completion transaction before finalizing. Evidence means persisted `LearningEvidence` linked to the session, not a client turn count, AI opening, or analytics event.

`finalizeLearningSession` receives or derives a server-owned `CompletionOutcome`; its idempotent profile minute update runs only after evidence validation.

## Required implementation

- An untouched active session MUST remain active if completion is requested. No completed timestamp, profile time increment, summary/debrief write, or next-action state may be created.
- A valid manual end with one or more evidence items becomes `PARTIAL` unless its state already qualifies as normal automatic completion; a successful auto BOSS completion is `COMPLETED`.
- DTO parsing must expose safe additive outcome data. Missing outcome on old completed rows uses an explicit backwards-compatible display default that does not claim a success trophy without evidence of success.
- Session player must render distinct Vietnamese copy/visual treatment for `PARTIAL`, and must retain the existing successful-debrief UI for `COMPLETED`.
- Existing idempotent completion semantics MUST be retained for valid completed sessions.

## Forbidden area

- MUST NOT treat a client-supplied `turnCount`, phase, score, or completion flag as proof of evidence.
- MUST NOT change automatic completion success criteria or server intervention answer grading.
- MUST NOT remove the user’s manual “end session” path merely to avoid partial outcomes.

## Error matrix

| Condition | Required behavior |
|---|---|
| active, zero evidence | domain conflict/validation, no mutation |
| active, evidence, non-DEBRIEF | completed `PARTIAL`, remediation-oriented debrief |
| active, auto-success/DEBRIEF | completed `COMPLETED`, success debrief |
| already completed | return stored result without incrementing minutes |
| abandoned/foreign | preserve current authorization/conflict behavior |

## Acceptance evidence

- Unit/service: zero-evidence rejection and no `learnerProfile.update`; one-evidence manual stop yields `PARTIAL`; BOSS automatic path yields `COMPLETED`; duplicate completion does not re-increment.
- Route/E2E: a direct completion request to untouched owned session fails and it stays active; a three-failed-turn manual exit visibly says partial/remediation, without a completion trophy; existing successful automatic debrief remains green.
