# P64 — Server-authoritative adaptive games

## Contract

`POST /api/game-runs` creates one `ACTIVE` run with 6–10 private rounds. It loads the learner profile/mastery and a bounded vocabulary candidate set in bulk, then applies the deterministic selector:

1. due vocabulary with low/uncertain mastery;
2. recently missed/new vocabulary;
3. remaining curriculum vocabulary closest to the current difficulty band.

The selector samples the same mode shell for all learners, but changes item selection, number/quality of distractors, hint availability, context length and difficulty according to the owner snapshot. It records only public prompt/options in `publicJson`; normalized correct answers and matching maps remain in `validatorJson`.

Before loading the candidate snapshot, the server reads at most 12 server-owned `AdaptiveGameRun.startedAt` rows for the authenticated learner. A new run is refused if that learner created another fresh run in the last 10 seconds or already created 12 in the preceding rolling 24 hours. The same bounded check MUST run again immediately before `AdaptiveGameRun.create` inside the write transaction; mode, status, browser clock, run id and answer retries MUST NOT affect this accounting. This guard protects creation only: retrying an existing answer with the same `clientAnswerId` remains idempotent and does not consume a fresh-run slot.

`POST /api/game-runs/:runId/answers` verifies the owned active run and next/unanswered round, normalizes the submitted answer, grades it against private validator data, then in one bounded transaction writes `AdaptiveGameRound`, `AdaptiveEvidence`, `VocabularyMastery` and `SkillMastery`. An exact duplicate `clientAnswerId` returns the stored result; a different replay or stale round is `409`.

Each run has at most 10 rounds and one answer request has a database budget of 12 logical queries/commands. Closed games do not invoke an LLM.

## UI contract

Keep Quiz, Match and Spell visual forms and timer/progress treatment. `games-client.tsx` must fetch a server-issued run before rendering a round and submit the learner answer, never a correctness Boolean. It must display an honest error/retry state if a run cannot be issued. A new run is explicit user action, not an automatic refresh loop.

## Errors and caller response

| Error | Required response |
|---|---|
| no candidate words | 409 with an actionable review/lesson message |
| foreign/unknown run/round | 404 `PRIVATE_NOT_FOUND` |
| expired/completed/stale run | 409 `GAME_CONFLICT`, client offers new-run button |
| duplicate client answer | prior result, `idempotent:true`, no second evidence |
| malformed answer | 400, leave round unanswered |
| fresh-run cooldown or rolling cap | 429 `GAME_RATE_LIMIT`, numeric `Retry-After` header/body field; client shows the wait and MUST NOT auto-retry |

## Forbidden zone

- `/api/game-session` must not remain a path that turns `{ correct: true }` into mastery. Redirect/remove safely or return a retired endpoint error.
- The browser must not calculate or receive answer keys for quiz/match/spell.
- Do not backfill or reuse historical client-trusted game outcomes as adaptive evidence.

## Acceptance evidence

- Test fixtures with opposite mastery profiles receive same mode schema but differing round difficulty/candidates.
- Tampering with `correct`, answer key, user ID or round ID cannot alter mastery.
- An answer is provably exactly-once and D1 count/query tests stay below the budget.
- A pure clock test and service/route tests prove the 10-second cooldown, 12-per-24-hour rolling cap, typed `Retry-After`, and unchanged answer-retry path.
