# Architecture — Plan11

## Goal and runtime contract

Reuse Next Node + Prisma/libSQL/Turso, current `LearningSession`, `LearningEvidence`, `AdaptiveEvidence`, learner intent/memory and `planNextLearningAction(userId: string, now?: Date): Promise<LearningDecision>`.

Primary experience: intent → recommended Mission/Coach/Quest or resume → learner response → bounded live coaching → comeback → server evidence → next action with causal reason. Lessons/quiz/flashcards are contextual support. User may change intent or select another valid activity. Provider unavailability is an explicit state, never fabricated coaching.

Before public writes, mutation commits satisfy `(owner,clientKey,canonicalPayload) -> one durable result`; collision/failure cannot record learning that did not apply. Before pilot, evaluation runs actual orchestration over multi-turn cases and reviewers inspect output. Deterministic planning/validation remains server authority; AI proposal cannot choose grades or ownership.

## Invariants and forbidden zone

- BẮT BUỘC keep validators, accepted answers, grading/state/mastery and source ownership on server. Memory update and its evidence commit together on existing session paths.
- BẮT BUỘC finish P111/P112 before accepting public write-enabled release. P114/P115 preparation may run locally while hosted gates remain open.
- BẮT BUỘC distinguish local/CI/Preview/Production/live/reviewer/pilot evidence and preserve original report timestamps.
- CẤM add a second planner, vector DB, agent framework, synthetic LearningSession for legacy activity, or backfill unmeasured ability. These do not repair the evidenced contracts and obscure source provenance.
- CẤM make recommendation GET/render call a provider or write state; calling an LLM on every request is not the AI-native criterion.
- CẤM add speech/pronunciation claims from text-only evidence, expand curriculum broadly, or start cosmetic redesign in this scope; learning quality must first be observed.
- CẤM assume planning authorizes hosted secrets/writes, production cutover or pilot recruitment.

## Error/caller matrix

| Class | Required behavior |
|---|---|
| No evidence | CALIBRATE; honest “chưa đủ dữ liệu”, no fabricated level |
| Missing/foreign source | Omit reference/return owner-private unavailable target; no leaked owner |
| Mutation collision | Re-read durable outcome or typed 409; no partial learning rows |
| Provider unavailable/unknown | Typed state; preserve prior evidence, no mock success/automatic uncertain retry |
| Incomplete acceptance evidence | Gate OPEN/UNVERIFIED; root does not release on worker summary |

## Evidence and router

Measured review baseline: 437/437 unit, type-check exit0, structural eval30/30+12/12; stale-review probe logs=1 on [1,0] confirms integrity defect. Desired numbers are in TESTING-ACCEPTANCE and are unexecuted gates.

Read 01-CONTRACTS → P111 → P114 → P115 → OPERATIONS → TESTING-ACCEPTANCE. Plan07 owns hosting/cutover/rollback, Plan09 hosted mail; this package adds no competing operational authority.
