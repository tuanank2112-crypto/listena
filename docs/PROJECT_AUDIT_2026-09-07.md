# Rà soát ListenAI — 2026-09-07

User xác nhận tự học tiếng Anh AI-native: AI điều phối mục tiêu/ngữ cảnh/correction/next action; curriculum/quiz/flashcards hỗ trợ. Patch ổn định loop có sẵn, không tuyên bố đã có adaptive agent đầy đủ.

## Phạm vi
Root: configs/AGENTS/docs/reports/schema/migrations/seed/import/generators/manifest/operations/tests/integration. Astra: src/server,src/app/api,proxy,core trừ TTS. Sol: pages/layouts/clients/components/features/core TTS/Python sidecar/E2E. Dataset kiểm cấu trúc/count/import, không thẩm định từng câu về sư phạm; dependency/generated files không phải source audit.

Baseline74 tests/21 files, type-check PASS, lint0 errors/38 warnings, Prisma validate/migrations PASS.

| Finding | Xử lý |
|---|---|
| HTTPS login loop | secureCookie + real JWT tests |
| Validator đúng nhưng AI/state sai | Authoritative outcome trước persistence |
| Auto-complete mất studyMinutes | Shared finalizer idempotent |
| Cross-owner teacher/draft attempt | Ownership/publication checks |
| SRS counter reset | Atomic increment |
| Future cards/queue vòng lặp | Due filtering, exhaustion, retry UX |
| Intervention giữ state cũ | key=id |
| CHOICE index vượt options | Cross-field validation |
| Course-first hero/thiếu resume | Primary AI resume/start |
| Voice toggle chết | Bỏ control, giữ WebSpeech |

## Backlog có bằng chứng
Render PostgreSQL khác SQLite; TTS auth/speed/cache chưa đúng contract; weekly metric lifetime capped/history thiên attempts; legacy multiwrite transactions; Kokoro/generator deprecation. Chi tiết [gotchas](../brain4agent/-known-gotchas.md).

## Điều phối
Astra runtime, Sol UI, Luna utility; subagents bị usage limit giữa chừng, root tiếp quản và kiểm tra phần dở. Không commit/push/deploy/reset DB người dùng. Kết quả cuối tại [acceptance](../planning/01_2026-09-07_project-hardening/specs/TESTING-ACCEPTANCE.md).
