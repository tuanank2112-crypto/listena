# Plan 06 — Personalized AI learning and adaptive games

- STT: 06
- Status: DEPLOYED — awaiting user-owned provider secret
- Started: 2026-09-10 (Asia/Saigon)
- Target: 0.5.0 MINOR
- Acceptance environments: local Node/SQLite, local Worker D1 emulator, and public Cloudflare Workers + D1.

## Decision log

- 2026-09-10: The user requires genuinely AI-native learning: each learner receives persisted, individual AI-generated lessons; it is not acceptable to represent a deterministic or dataset response as live AI.
- 2026-09-10: Keep deterministic, server-side grading for closed exercises and word games. AI generates bounded learning content and evaluates only open-ended language work; it is not called for every render or answer.
- 2026-09-10: A personalized lesson is a private, versioned artifact instead of a global `Lesson`. This prevents another learner's material and private answer validators from leaking through existing curriculum queries.
- 2026-09-10: The deployed runtime must fail closed and visibly for AI generation when its configured provider/key is unavailable. Test-only deterministic providers remain injectable in tests, but no production path may silently label them as AI.
- 2026-09-10: Core tracked TATQHP1 dataset is restored by a repeatable, additive, idempotent remote-D1 import. It must not reset production or import the Educaplay/Da Nang reference corpus as curriculum.
- 2026-09-10: The same three game forms remain familiar to every learner; the server privately selects and grades rounds according to evidence, mastery, calibration and difficulty. Client-provided `correct` values are no longer evidence.
- 2026-09-10: Production Worker version `8d50494f-773f-46bb-9910-23c4474d9b4d` was deployed after core D1 recovery. The live-provider gate intentionally remains open until the account owner installs `OPENAI_API_KEY` as a Worker secret and performs a real generated-lesson smoke.

## Superseded decisions

- Plan05's schema-only D1 release is superseded for curriculum availability: Plan06 authorizes a controlled core-dataset import, while preserving Plan05's no-reset/no-seed invariant.
- Historical mock/fallback behavior is superseded for learner-facing AI flows. The deterministic provider remains a test double only, not a production remediation answer presented as AI.

## Work packages

| Package | Owner / model | Scope | Dependency | Acceptance |
|---|---|---|---|---|
| P61 Content recovery | Astra | additive D1 import, canonical curriculum visibility | none | production has core tracked data without deleting existing user data |
| P62 Live AI boundary | Astra | OpenAI Responses structured-output provider, key/config guard, honest failures | none | a missing/bad key reaches a labelled error, never a mock answer |
| P63 Private lessons and calibration | Astra | learner profile calibration, private generated lesson/API/player/evidence | P62 | two users cannot read each other's lesson; generated artifact is persisted and provenance recorded |
| P64 Server-authoritative games | Astra | adaptive run/round data, routes, client integration, evidence/mastery | P61 | server grades once; client cannot claim correctness or cross-user rounds |
| P65 Resource and safety gates | Astra | query/call bounds, test coverage, production runbook | P61–P64 | Worker/D1/API requests are bounded and deployment evidence is recorded |

## Execution checklist

- [x] Verify brain boot, read kernel/index/hot state and Plan05.
- [x] Audit deployed bindings, D1 usage, tracked datasets, AI provider and game paths.
- [x] Read current Next route-handler/runtime/environment guidance and OpenAI Responses documentation.
- [x] Create this complete spec package before implementation.
- [x] Add append-only schema/migration and regenerate clients.
- [x] Implement/import the tracked core curriculum into remote D1 without a reset.
- [x] Implement real-provider contracts and remove production silent fallback.
- [x] Implement private personalized lessons, calibration and learner UI.
- [x] Implement server-owned adaptive game runs and replace client-trusted submissions.
- [x] Run local/unit/type/Worker/D1 acceptance gates.
- [ ] Configure the user-owned provider key as a hosted Worker secret, deploy and verify public behavior.
- [ ] Synchronize project knowledge, commit and push only the task-owned changes.

## Spec router

| Contract | Specification |
|---|---|
| Architecture, privacy and forbidden zones | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| Data, API and module contracts | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| Dataset recovery | [P61 data recovery](specs/SPEC-P61-DATA-RECOVERY.md) |
| Live provider | [P62 live AI](specs/SPEC-P62-LIVE-AI.md) |
| Personalized lessons | [P63 lessons](specs/SPEC-P63-PERSONALIZED-LESSONS.md) |
| Adaptive games | [P64 games](specs/SPEC-P64-ADAPTIVE-GAMES.md) |
| Operations and rollback | [OPERATIONS](specs/OPERATIONS.md) |
| Test and production gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
