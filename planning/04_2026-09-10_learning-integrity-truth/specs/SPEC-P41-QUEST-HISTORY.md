# P41 — Daily Quest history reaches the planner

## Contract

The real `createLearningSession` path supplies recent owned Daily Quest keys to `startMission`. `planDailyQuest` selects an authored scenario not found in that bounded history when one exists.

## Required implementation

- Read at most the latest authored Daily Quest states necessary to cover the planner candidate set; query only by `userId` and `mode: DAILY_QUEST`.
- Parse `stateJson` defensively and keep only `isMissionScenarioKey` values.
- Preserve explicit valid `scenarioKey` semantics for Mission and Coach. Do not retroactively alter existing session state.
- Add a service-level integration test; a direct planner-only test is insufficient.

## Forbidden area

- MUST NOT invent a new scenario, call an AI provider to choose one, or persist a “last scenario” duplicate source of truth.
- MUST NOT make a Quest fail merely because all authored scenarios are recent.

## Error matrix

| Condition | Behavior |
|---|---|
| no prior quests | planner’s existing deterministic initial selection |
| one/two valid recent keys | choose a valid unused alternative |
| all keys recent | planner’s documented deterministic fallback |
| malformed / foreign row | ignore it completely |

## Acceptance evidence

- Test creates owned recent Quest session states then invokes `createLearningSession`; captured `startMission` input has the validated keys and output scenario differs when an alternative exists.
- Test confirms malformed state cannot crash session start or cause an invalid key.
