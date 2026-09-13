# Bản đồ ListenAI

Đọc [kernel](memory-distill.txt) → [hot log](memory/hot/today.md)/[state](memory/hot/state.json) → docs module → source.

| Phạm vi | Source | Tài liệu |
|---|---|---|
| Product AI-native | dashboard/games/session | [Tổng quan](project-intro.md), [AI architecture](../docs/AI_FIRST_ARCHITECTURE.md) |
| Kế hoạch hiện tại | planning/07_2026-09-10_vercel-turso-migration | [Plan 07](../planning/07_2026-09-10_vercel-turso-migration/plan.md) — canonical Turso staging and bounded Vercel Preview evidence are recorded; full hosted ownership/retry, final export/cutover, Production and successful live Kira remain unchecked |
| Rà soát lịch sử | source snapshot aa2021d | [Review 2026-09-13](../docs/PROJECT_REVIEW_2026-09-13.md) — 8 findings at 293 tests; frozen source review, not a current implementation-status claim |
| Cải tiến AI-native (local accepted) | planning/08_2026-09-13_ai-native-self-learning | [Plan08](../planning/08_2026-09-13_ai-native-self-learning/plan.md) — P80–P85 implementation + local acceptance complete: 387/387 tests (78 files), type-check/build/Prisma PASS, E2E 20/20, offline quality 30/30 and 12/12; hosted/live/pilot remain open |
| Rà soát lịch sử | toàn repository | [Audit 2026-09-07](../docs/PROJECT_AUDIT_2026-09-07.md) |
| Auth, session, SRS | proxy; server/auth,learning,services,repos | [Learning](../docs/learning.md) |
| Audio | core/tts; components/providers; tts-service | [ADR](../docs/adr/0001-tts-engine.md) |
| DB/dataset | prisma; dataset; scripts | [Data](-data-architecture.md), [Dataset](../dataset/README.md) |
| Vận hành | `vercel`/Turso target config; `migrations`; `scripts/verify-turso-migration.ts`; e2e/setup.ts | [Plan07 operations](../planning/07_2026-09-10_vercel-turso-migration/specs/OPERATIONS.md) — Cloudflare files remain historical rollback material |
| Bộ nhớ | brain4agent | [Gotchas](-known-gotchas.md), [Roadmap](roadmap.md), [Changelog](changelog.md) |

## Code map
- src/app: landing/login/register; learner dashboard/games/session/lessons/flashcards/progress/attempt; teacher dashboard/courses/lessons; API.
- src/features/learning-session: client types/reducer, start button, durable start-request contract, intervention renderer, request IDs. `src/features/learner-intent` and `src/server/learner-intent` own learner goal/preferences and revision-CAS updates.
- src/components: AppShell, providers. src/lib và src/types: explicit database/runtime config, Prisma/libSQL singleton, atomic batch, opaque database errors and migration-write gate.
- src/server: auth, validation, live Kira Chat Completions / OpenAI Responses provider boundary, grounding, personalized-learning, adaptive-games, learning persistence and shared next-action planner, legacy services/repos, dataset catalog.
- src/core: assessment/text, games/scoring, learner model, recommendation, SM-2, TTS.
- prisma: schema/3 additive migrations/demo seed. Seed có xóa dữ liệu: chỉ chạy trên DB mới hoặc E2E riêng; Plan07 staging migration uses a reviewed D1 snapshot/import and verifier, never seed/reset the live D1.
- dataset: JSON giáo trình và raw source; scripts: import, regeneration, legacy prebuild.
- e2e: setup database tạm, smoke, learning regressions; unit tests colocated trong src.
- tts-service: Python sidecar; public: static assets/cache ignored.
- docs, planning, brain4agent: docs kỹ thuật/spec/bảy phân vùng và hot memory. .agents/skills là vị trí skill workspace nếu bổ sung.

## API
/api/learning-sessions: create; /:id:resume; /:id/turns:reply; /:id/events:analytics; /:id/complete:debrief; `/api/learner/intent` and `/api/learner/next-action` provide server-authoritative learner context and a read-only shared plan.
Hỗ trợ: attempt, flashcard, game-runs + answers (server-authoritative), learner/personalized-lessons + attempts (private), recommendation, learner/progress, tutor, tts/vie và teacher lesson CRUD/generation. `game-session` is legacy 410.
