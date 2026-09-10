# Plan 06 — Personalized AI learning and adaptive games

- STT: 06
- Status: IN PROGRESS — P65 D1/resource hardening, public code deployment and the Kira secret binding are verified; a genuine authenticated smoke remains pending
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
- 2026-09-10: Production Worker version `8d50494f-773f-46bb-9910-23c4474d9b4d` was deployed after core D1 recovery. The live-provider gate intentionally remains open until the account owner installs the selected provider secret and performs a real generated-lesson smoke.
- 2026-09-10: The account owner selected KiraAI for the next production deployment: `AI_PROVIDER=kira`, `KIRAAI_MODEL=glm-5.3-flash-free`, `KIRAAI_BASE_URL=https://kiraai.vn/api/v1`, and hosted secret name `KIRAAI_API_KEY`. Kira documents an OpenAI-compatible Chat Completions endpoint, not the OpenAI Responses endpoint; its adapter must therefore validate JSON server-side rather than claim OpenAI Responses strict-schema behavior.
- 2026-09-10: A provider key was supplied through chat during setup. It is treated as exposed: it is not used, stored or deployed, and the owner must rotate it before adding a fresh `KIRAAI_API_KEY` directly in Cloudflare.
- 2026-09-10: Prisma's Cloudflare D1 adapter rejects callback-form transactions and does not provide their ACID guarantee. P65 replaces every production-reachable multi-row learning/game callback boundary with parameterized native `DB.batch()` plus an explicit commit fence; local Node/SQLite keeps callback transactions.
- 2026-09-10: Live provider resource control is shared per learner, not per UI screen or Worker isolate: 40 reservations per rolling 24 hours and a 30-second pending lease apply to every live call; one-off provisioning/tutor/admin purposes also have a 12-second cooldown. Learning-loop `start_mission` and conversational `evaluate_turn` deliberately rely on the pending lease + shared daily cap so a learner can immediately continue after an AI reply or next-action CTA. A rejected reservation returns `AI_REQUEST_LIMIT`/429 before any upstream request.
- 2026-09-10: P65/Kira code was deployed as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250` with the Kira secret intentionally absent. Public `/api/health` and `/login` returned HTTP 200; this proves code availability, not provider account availability or a generated-lesson outcome.
- 2026-09-10: The Production `KIRAAI_API_KEY` binding was created in Cloudflare, resulting in secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b` at 100% deployment. Secret contents are intentionally not observable; this is not evidence that the provider accepts the value or that a generated lesson succeeds.

## Superseded decisions

- Plan05's schema-only D1 release is superseded for curriculum availability: Plan06 authorizes a controlled core-dataset import, while preserving Plan05's no-reset/no-seed invariant.
- Historical mock/fallback behavior is superseded for learner-facing AI flows. The deterministic provider remains a test double only, not a production remediation answer presented as AI.
- The initial Plan06 operational choice of `OPENAI_API_KEY` as the active production secret is superseded by KiraAI's `KIRAAI_API_KEY` for this deployment. OpenAI remains a documented, explicit alternative and is never selected merely by pointing its Responses adapter at Kira.

## Work packages

| Package | Owner / model | Scope | Dependency | Acceptance |
|---|---|---|---|---|
| P61 Content recovery | Astra | additive D1 import, canonical curriculum visibility | none | production has core tracked data without deleting existing user data |
| P62 Live AI boundary | Astra | Kira Chat Completions / OpenAI Responses provider boundary, key/config guard, honest failures | none | a missing/bad key reaches a labelled error, never a mock answer |
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
- [x] Run prior Plan06 local/unit/type/Worker/D1 acceptance gates.
- [x] Verify P65 native D1/resource changes with the full local gate suite and Worker build.
- [x] Deploy Kira configuration with the hosted key absent and verify the public health/login baseline.
- [x] Create the Production `KIRAAI_API_KEY` secret binding and verify its name/version only.
- [ ] Verify one bounded authenticated generated-lesson smoke and safe persisted provenance.
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
| Resource safety and D1 atomicity | [P65 resource/D1](specs/SPEC-P65-RESOURCE-D1.md) |
| Operations and rollback | [OPERATIONS](specs/OPERATIONS.md) |
| Test and production gates | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) |
