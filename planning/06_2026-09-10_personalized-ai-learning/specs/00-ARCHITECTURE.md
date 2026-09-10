# Architecture — private AI learning loop

## Objective and router

Build a learning loop in which server-held learner evidence selects a bounded target, a real configured AI provider creates a private lesson artifact, and the same server-owned evidence adapts the next game run. Read `01-CONTRACTS.md` first for exact payloads; P61–P65 specify each implementation boundary.

The goal is not an LLM chat skin. A learner must receive material whose target and difficulty can be traced to their own profile/evidence, and future selection must consume scored evidence rather than a client assertion.

## Architecture contract

```text
profile + mastery + evidence + core curriculum
                 │ (bounded snapshot, hashed provenance)
                 ▼
 real configured provider ──► PersonalizedLesson (owner-only, immutable content)
                 │                        │
                 │                        ▼
                 └────► objective attempts / AdaptiveGameRun (server answer key)
                                            │
                                            ▼
                                AdaptiveEvidence + mastery update

live call ──► atomic `AIInteraction` reservation ──► configured provider
                    │                                      │
                    └──── 429 before upstream if bounded ───┘
```

MUST:

- Treat `PersonalizedLesson`, its validator JSON and all game rounds as private user data. Every read/write owner-checks `userId` in the database query.
- Keep public curriculum (`Lesson`) and private lesson artifacts distinct. Public curriculum queries MUST NOT enumerate private artifacts; private player routes MUST NOT resolve a global lesson ID.
- Persist a lesson before returning it; a GET/page refresh MUST NOT invoke an LLM or create a duplicate artifact.
- Use AI only behind a server boundary. The API key MUST NOT be exposed via `NEXT_PUBLIC_*`, logs, browser payloads, generated assets or git.
- Treat the active KiraAI transport as `POST /chat/completions` under `https://kiraai.vn/api/v1`; it MUST NOT be routed through the OpenAI Responses implementation or documented as having that endpoint's strict-schema guarantee. Its JSON output is parsed and validated server-side before persistence.
- Restrict Kira's configured base to the canonical HTTPS API path and reject redirects. A bearer credential MUST NOT be sent to a different origin.
- Keep OpenAI as an explicit alternative: its `POST /responses` adapter uses its own documented strict-schema and `store:false` controls. Changing `AI_PROVIDER` selects a transport; changing only a base URL does not.
- Reserve every real provider call under the server-owned learner ID before it is sent. The D1 reservation is the shared cross-isolate resource fence; no client timer or in-memory counter is authoritative.
- Use native parameterized `env.DB.batch()` for the P65 learning-session, private-lesson/attempt and adaptive-game mutation graphs that rely on all-or-nothing state. Local SQLite retains its callback transaction branch. Other routes must not be represented as P65-native until they meet this boundary. P65 owns exact fences and limits.
- Use deterministic server grading for closed answers. AI grading for open responses MUST return a validated rubric/score/confidence before evidence is recorded.
- Use append-only migrations and additive deployment/import actions. Existing User, LearningSession, mastery and curriculum rows MUST survive.

MUST NOT:

- Never represent a mock, retrieval fallback, stale cache or generic template as a current AI response.
- Never use `correct`, a vocabulary ID alone, or a correct-answer key supplied by the browser as mastery evidence.
- Never reveal `validatorJson`, correct answers, a provider key, raw provider request, another user's artifact, or detailed private evidence in a public DTO.
- Never import `dataset/educaplay-danang.json` or `dataset/danang-getaway-lesson.json` into the production curriculum under this package; they are reference data, not approved curriculum.
- Never call the provider per page render, client retry loop, or individual closed game answer.
- Never reuse a provider key that was exposed through chat/logs, weaken the Kira origin/redirect guard, or send a key in a local command transcript.
- Never treat a D1 callback `prisma.$transaction()` as an ACID boundary or report a native-batch zero-change fence as accepted work.

## Error classes and caller behavior

| Class | Meaning | Caller behavior |
|---|---|---|
| `AI_UNAVAILABLE` | provider/key/config/timeout/invalid structured output | return 503 with an honest retry message; preserve existing artifact; do not synthesize content |
| `PERSONALIZATION_LIMIT` | per-user personalized-lesson quota | return 429 with `retryAfterSeconds`; do not retry automatically |
| `AI_RATE_LIMITED` | upstream provider 429 | return typed 503 with `retryAfterSeconds`; do not retry automatically |
| `AI_REQUEST_LIMIT` | local server reservation lease/cooldown/rolling cap | return 429 with `Retry-After`; do not contact the provider or auto-retry |
| native D1 fence conflict | another request won, stale state or exact duplicate | read back exact idempotent result; otherwise return 409 and preserve state |
| `PRIVATE_NOT_FOUND` | owner-filtered lesson/run/round absent | return 404; never distinguish another user's item |
| `GAME_CONFLICT` | stale, answered, expired or idempotency conflict | return existing answer result when exact idempotent replay; otherwise 409 |
| `VALIDATION_ERROR` | invalid input/output contract | return 400 for client input; mark provider request failed for output |
| `DATA_IMPORT_CONFLICT` | malformed/unknown stable dataset record | abort before remote execute; no partial destructive repair |

## Acceptance evidence

- Local: two authenticated fixture learners can only fetch their own private lesson/run; provider absence produces `AI_UNAVAILABLE`, not beach/default content.
- Local: a closed answer's score is derived from server-owned validator data and creates exactly one evidence row.
- Server: D1 query confirms core import counts and preservation of the pre-existing User row.
- Server: Worker secret listing contains the key's name only; no response or source artifact contains its value.
