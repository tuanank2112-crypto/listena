# Bản đồ ListenAI

Đọc [kernel](memory-distill.txt) → [hot log](memory/hot/today.md)/[state](memory/hot/state.json) → docs module → source.

| Phạm vi | Source | Tài liệu |
|---|---|---|
| Product AI-native | dashboard/games/session | [Tổng quan](project-intro.md), [AI architecture](../docs/AI_FIRST_ARCHITECTURE.md) |
| Kế hoạch hiện tại | planning/03_2026-09-08_learning-loop-completion | [Plan 03](../planning/03_2026-09-08_learning-loop-completion/plan.md) — hoàn thiện hợp đồng Plan 02; local gates PASS, production deferred |
| Rà soát | toàn repository | [Audit](../docs/PROJECT_AUDIT_2026-09-07.md) |
| Auth, session, SRS | proxy; server/auth,learning,services,repos | [Learning](../docs/learning.md) |
| Audio | core/tts; components/providers; tts-service | [ADR](../docs/adr/0001-tts-engine.md) |
| DB/dataset | prisma; dataset; scripts | [Data](-data-architecture.md), [Dataset](../dataset/README.md) |
| Vận hành | configs; e2e/setup.ts | [README](../README.md), [Operations](../planning/01_2026-09-07_project-hardening/specs/OPERATIONS.md) |
| Bộ nhớ | brain4agent | [Gotchas](-known-gotchas.md), [Roadmap](roadmap.md), [Changelog](changelog.md) |

## Code map
- src/app: landing/login/register; learner dashboard/games/session/lessons/flashcards/progress/attempt; teacher dashboard/courses/lessons; API.
- src/features/learning-session: client types/reducer, start button, intervention renderer, request IDs.
- src/components: AppShell, providers. src/lib và src/types: Prisma singleton/log/utilities/types.
- src/server: auth, validation, AI/provider/fallback/grounding, learning persistence, legacy services/repos, dataset catalog.
- src/core: assessment/text, games/scoring, learner model, recommendation, SM-2, TTS.
- prisma: schema/2 migrations/demo seed. Seed có xóa dữ liệu: chỉ chạy trên DB mới hoặc E2E riêng.
- dataset: JSON giáo trình và raw source; scripts: import, regeneration, legacy prebuild.
- e2e: setup database tạm, smoke, learning regressions; unit tests colocated trong src.
- tts-service: Python sidecar; public: static assets/cache ignored.
- docs, planning, brain4agent: docs kỹ thuật/spec/bảy phân vùng và hot memory. .agents/skills là vị trí skill workspace nếu bổ sung.

## API
/api/learning-sessions: create; /:id:resume; /:id/turns:reply; /:id/events:analytics; /:id/complete:debrief.
Hỗ trợ: attempt,flashcard,game-session,recommendation,learner/progress,tutor,tts/vie và teacher lesson CRUD/generation.
