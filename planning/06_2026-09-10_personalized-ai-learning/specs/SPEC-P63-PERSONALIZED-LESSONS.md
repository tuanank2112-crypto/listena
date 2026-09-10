# P63 — Learner-owned generated lessons and calibration

## Contract

The service builds a `LearnerSnapshot` from the owner's profile, weakest skills, recent `LearningEvidence`/`AdaptiveEvidence`, due vocabulary, preferences, selected curated sources and a hash of those inputs. It asks the live provider once for this bounded `PersonalizedLessonDraft`:

```ts
{
  title: string; targetSkill: SkillKey; cefrLevel: CefrLevel; difficulty: number;
  objectives: string[]; introVi: string; transcript: string; vocabulary: VocabularyDraft[];
  exercises: Array<{ id: string; type: "CHOICE"|"SPELL"|"FILL"; prompt: string; options?: string[]; answer: string|string[]; feedbackVi: string }>
}
```

The server validates cardinality/lengths, separates learner-visible `contentJson` from server-only `validatorJson`, and atomically persists an owner-bound READY artifact. Its vocabulary is normalized into `VocabularyItem` with `update:{}` only, then joined through `PersonalizedLessonVocabulary`; therefore the artifact can feed owner-only adaptive games without making the lesson or its linkage public. It returns an existing current READY artifact for the same user/skill/snapshot window rather than spending another request. A failed provider call must leave only an optional `FAILED` audit record without content/validator.

The learner-facing page and every attempt route query with `{ id, userId }`. Version 0.5 only generates objectively gradeable closed exercises: evaluation is normalized and deterministic on the server, then updates evidence/mastery only inside the successful transaction. It does not pretend a closed answer has AI grading. `PersonalizedLessonAttempt` owns attempt-level idempotency through `clientAttemptId`; replay returns the original result exactly once. Open-response AI grading is a future extension and MUST add a separately validated rubric/score contract before it can write evidence.

Before a *new* provider request (never before returning a matching READY artifact), the service enforces one active generation per learner, a five-minute successful-generation cooldown and at most eight new personalized lessons per rolling 24 hours. It reads the bounded `AIInteraction(userId,purpose,createdAt)` provenance index; the browser cannot bypass this by changing target skill or retrying. This is a cost/resource guard, not a fake-AI fallback.

## Calibration contract

New and existing profiles start/continue `UNASSESSED` until at least 8 high-confidence, server-scored evidence items across at least two skill keys exist. Before that threshold, the system adjusts lesson difficulty within a narrow 0.2 band but MUST NOT assert a new CEFR. At threshold, it is `CALIBRATING`; CEFR may change only after 12 qualifying items and a 0.15 aggregate score margin. Store the transition/source count in profile metadata or an auditable evidence query. No single response changes CEFR.

## Errors and caller response

| Error | Required behavior |
|---|---|
| no usable ground truth / no configured AI | return 503 without creating a bogus lesson |
| another user's lesson/attempt | 404 `PRIVATE_NOT_FOUND` |
| invalid draft or answer | reject and return safe 503/400, never partially expose it |
| existing matching ready lesson | return it with `reused:true` |
| duplicate attempt ID | return original result without duplicate evidence/mastery |
| active generation / persisted-lesson cooldown-daily guard / shared AI reservation | 429 `AI_RATE_LIMITED` for an active generation, `PERSONALIZATION_LIMIT` for the legacy persisted-lesson guard, or `AI_REQUEST_LIMIT` for the shared reservation; all include `Retry-After`, and reuse/saved lessons remain available |

## Forbidden zone

- Private lessons MUST NOT enter `Lesson`, teacher listing, public recommendations, global games or the `/learner/lessons/[lessonId]` route.
- A prompt MUST NOT include unlimited historic turns, all memory, raw passwords/email, correct answers from unrelated learners, or an unbounded dataset payload.
- AI-generated content MUST NOT be declared "personalized" without a persisted source snapshot hash and target/difficulty provenance.

## Acceptance evidence

- Two fixture learners get different snapshot inputs and private lesson IDs; cross-owner GET/POST returns indistinguishable 404.
- Same owner/action reuse does not issue a second provider request.
- Twelve controlled evidence rows demonstrate the calibration guard and one answer cannot change CEFR.
