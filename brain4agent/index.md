# Bản đồ ListenAI

Đọc [kernel](memory-distill.txt) → [hot log](memory/hot/today.md)/[state](memory/hot/state.json) → [Plan12 router](../planning/12_2026-09-17_project-completion-release/plan.md) → docs module → source. Luôn đối chiếu `git status`/diffstat với memory (đã có lần não lệch WIP).

| Phạm vi | Source | Tài liệu |
|---|---|---|
| Review ứng viên hiện tại | commit 9325ca2 + findings worktree | [Root code review 2026-09-17](../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md) — 7 findings F1–F7 đã được worker giải quyết hoàn tất; local 100% xanh (494 test/24 E2E/build 42 routes) |
| Su co AI provider | .env / .env.example / kira provider | [Chan doan 2026-09-17](../docs/AI_PROVIDER_OUTAGE_2026-09-17.md) — **doc truoc khi dung den AI**: model khong ton tai (da sua) → 18:45 tai phat do Vyce treo/cham khi sinh bai hoc dai (muc 9, cho user chon huong sua); Mission van on |
| Product AI-native | dashboard/games/session | [Tổng quan](project-intro.md), [AI architecture](../docs/AI_FIRST_ARCHITECTURE.md) |
| Kế hoạch tổng hiện tại | planning/12_2026-09-17_project-completion-release | [Plan12](../planning/12_2026-09-17_project-completion-release/plan.md) — VERSION 0.6.0 QUALIFIED: D1 local + CI ✅ (GitHub Actions run 35187260657, 15/15 steps PASS), P120/P121 integrity ✅, P123 causal planner p11-v1 ✅, P124 eval:learning ✅, P125 pilot tooling ✅, P126 runbook/backup/handover ✅; findings F1–F7 resolved; ready for Preview/Production gates. |
| Contract kỹ thuật | planning/11_2026-09-16_ai-native-evidence-gates | [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md) — QUALIFIED/SUBSUMED: P110–P112 đã được Plan12 P120 nghiệm thu, sửa lỗi TS/lint/test-design và commit trong 9325ca2; receipt/write-tx/causal/eval/pilot contracts vẫn là nguồn đặc tả chi tiết |
| Hardening đã triển khai | planning/10_2026-09-16_release-readiness-hardening | [Plan10](../planning/10_2026-09-16_release-readiness-hardening/plan.md) — acceptance qualified: P102/P103/P106 reopened, actual CI UNVERIFIED; hosted Ready/schema records remain historical |
| Account security | planning/09_2026-09-15_account-email-security | [Plan 09](../planning/09_2026-09-15_account-email-security/plan.md) — local acceptance complete; Resend-configured disposable Preview evidence remains open under Plan07 gates |
| Hạ tầng gốc | planning/07_2026-09-10_vercel-turso-migration | [Plan 07](../planning/07_2026-09-10_vercel-turso-migration/plan.md) — canonical Turso staging and bounded Vercel Preview evidence are recorded; full hosted ownership/retry, final export/cutover, Production and successful live Kira remain unchecked |
| Rà soát hiện tại | source snapshot de28cab | [Worker review 2026-09-16](../docs/WORKER_REVIEW_2026-09-16.md) — report/process/source audit; fresh437unit/type-check/structural eval, in-memory SQL/schema/hash defect probes |
| Review trước implementation | source snapshot 0ce30e1 | [Review 2026-09-16](../docs/PROJECT_REVIEW_2026-09-16.md) — historical425unit+20E2E baseline and Plan10 findings/spec |
| Rà soát lịch sử | source snapshot aa2021d | [Review 2026-09-13](../docs/PROJECT_REVIEW_2026-09-13.md) — 8 findings later completed locally by Plan08; frozen snapshot |
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
- src/server: auth, account-action token lifecycle, server-only Resend email boundary, validation, live Kira Chat Completions / OpenAI Responses provider boundary, grounding, personalized-learning, adaptive-games, learning persistence and shared next-action planner, legacy services/repos, dataset catalog.
- src/core: assessment/text, games/scoring, learner model, recommendation, SM-2, TTS.
- prisma: additive migrations and demo seed. Seed có xóa dữ liệu: chỉ chạy trên DB mới hoặc E2E riêng; Plan07 staging migration uses a reviewed D1 snapshot/import and verifier, never seed/reset the live D1.
- dataset: JSON giáo trình và raw source; scripts: import, regeneration, legacy prebuild.
- e2e: setup database tạm, smoke, learning regressions; unit tests colocated trong src.
- tts-service: Python sidecar; public: static assets/cache ignored.
- docs, planning, brain4agent: docs kỹ thuật/spec/bảy phân vùng và hot memory. .agents/skills là vị trí skill workspace nếu bổ sung.

## API
/api/learning-sessions: create; /:id:resume; /:id/turns:reply; /:id/events:analytics; /:id/complete:debrief; `/api/learner/intent` and `/api/learner/next-action` provide server-authoritative learner context and a read-only shared plan.
Hỗ trợ: account verification/password reset, verified feedback, attempt, flashcard, game-runs + answers (server-authoritative), learner/personalized-lessons + attempts (private), recommendation, learner/progress, tutor, tts/vie và teacher lesson CRUD/generation. `game-session` is legacy 410.
