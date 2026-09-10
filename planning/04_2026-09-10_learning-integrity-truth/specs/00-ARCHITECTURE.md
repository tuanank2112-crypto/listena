# Architecture — learning integrity and mastery truth

## Goal

Close three proven breaks in the learner loop without expanding the data model:

`recent Daily Quest activity → scenario selection`, `learner evidence → valid completion → truthful debrief`, and `SkillMastery → learner-visible meters`.

## Non-goals / forbidden zones

- MUST NOT modify Prisma schema, migrations, database provider, existing Plan03 memory transaction, `nextAction` algorithm, authored mission scenarios, or server intervention grading.
- MUST NOT create synthetic sessions or `LearningEvidence` for legacy attempts, flashcards, or games. Their general-evidence design is deferred.
- MUST NOT change public teacher registration, game-answer trust, Render PostgreSQL deployment, live TTS behavior, or provider billing/rate policy in this package.
- MUST NOT expose private tutor validators, raw memory, evidence content, credentials, or arbitrary redirects to clients.

## Architectural invariants

1. Server state is authoritative: the completion endpoint determines whether learner evidence exists and whether completion is successful or partial.
2. A completed `LearningSession` contains at least one learner-owned `LearningEvidence`; no evidence means `ACTIVE` remains unchanged and no study minutes are awarded.
3. A partial completion has evidence but has not met the normal automatic-success condition. It is still a valid endpoint, but must not be presented as a mission win.
4. Dashboard/progress meter values come from `SkillMastery` when a matching row exists; profile columns are compatibility fallback only for skills with no recorded skill mastery.
5. Daily Quest recency is bounded and read before `startMission`; the planner owns valid scenario selection and safe all-recent fallback.

## Read order

1. `01-CONTRACTS.md`
2. `SPEC-P41-QUEST-HISTORY.md`
3. `SPEC-P42-COMPLETION-TRUTH.md`
4. `SPEC-P43-MASTERY-TRUTH.md`
5. `OPERATIONS.md`, then `TESTING-ACCEPTANCE.md`

## Error classification

| Class | Required caller behavior |
|---|---|
| Missing/foreign session | preserve existing owner-scoped 404/401 response; no state read leak |
| Untouched active session | completion endpoint returns a stable validation/conflict response; client keeps session playable |
| Partial session | server completes truthfully; DTO marks outcome partial; UI shows remediation copy, not a trophy |
| Corrupt historical scenario state | ignore that row and let planner use its deterministic fallback |
| Missing `SkillMastery` row | render profile fallback; never invent a score client-side |
| Query/render failure | use existing route/page error boundary behavior; no optimistic mastery claim |

## Acceptance evidence

The executable matrix is in `TESTING-ACCEPTANCE.md`. No learning-quality or production efficacy claim is permitted from deterministic local tests.
