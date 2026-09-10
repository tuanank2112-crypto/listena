# Contracts

## Completion outcome

`completeLearningSession(userId: string, sessionId: string)` retains its public API envelope and returns a session DTO. Its persisted outcome is derived server-side in the existing validated session state JSON (no database migration):

```ts
type CompletionOutcome = "COMPLETED" | "PARTIAL";
```

The public `LearningSessionDto` gains an additive `completionOutcome?: CompletionOutcome` only when `status === "COMPLETED"`.

- `COMPLETED`: at least one learner evidence exists and the session reached the normal successful completion state (`DEBRIEF` / automatic completion condition).
- `PARTIAL`: at least one learner evidence exists but a learner explicitly ended the active session before the normal completion state.
- No learner evidence: reject with existing learning validation/conflict error semantics; `LearningSession.status`, `completedAt`, profile minutes, and `nextAction` must remain unchanged.

## Quest history

Before `startMission` for `mode: "DAILY_QUEST"`, the server loads a bounded recent list of owned Daily Quest scenario keys from active or completed sessions, newest first. Only validated mission keys enter:

```ts
type StartMissionInput = {
  mode: "LESSON_COACH" | "MISSION" | "DAILY_QUEST";
  scenarioKey?: string;
  goal?: string;
  learnerKey: string;
  learnerContext: LearnerTutorContext;
  lessonContext?: LessonTutorContext;
  recentScenarioKeys?: string[];
};
```

`recentScenarioKeys` is optional and ignored outside Daily Quest. The daily-quest planner is the only selector; it MUST return a valid authored key even when all candidates are recent.

## Mastery display

Server page/DTO code resolves a display value by this exact precedence:

```ts
resolveDisplayMastery(skillKey, skillMasteries, profile): number
// matching SkillMastery.masteryScore (clamped [0,1]) → mapped LearnerProfile column → 0.5
```

The supported keys are `listening`, `vocabulary`, and `spelling`. Progress may retain its additive detailed skill data. Client components receive plain display data only and MUST NOT import Prisma/server modules.

## Error matrix

| Error | Server behavior | Client behavior |
|---|---|---|
| Complete with zero evidence | 409/400 domain error, no write | show existing retryable message; do not navigate to debrief |
| Duplicate complete after partial/success | return existing completed DTO idempotently | show its matching outcome |
| Invalid recent state JSON | exclude from history | start valid deterministic Quest |
| No matching mastery record | profile/default fallback | render a meter, do not label it a new observed result |

## Contract boundaries

- Existing completed-envelope `nextAction` behavior stays unchanged for both valid outcomes.
- No endpoint request schema changes are needed.
- No completion-outcome input may be accepted from the client.

## Acceptance evidence

Exact test cases and measurable gates are in `TESTING-ACCEPTANCE.md`.
