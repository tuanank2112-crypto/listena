# Plan 13 — Khắc phục rà soát logic toàn repo, độ tin cậy AI, và Answer Canvas sáng tạo

- STT: 13
- Created: 2026-09-17 (tối), Asia/Saigon
- Status: LOCAL ACCEPTED (2026-09-17 23:15+07) — chờ user commit/push để chạy CI, đổi env Vercel `VYCE_*` và deploy. User chọn sửa **toàn bộ** findings của [Root logic review](../../docs/ROOT_LOGIC_REVIEW_2026-09-17_FULL_REPO.md), ưu tiên đăng nhập/đăng xuất/quên mật khẩu; sửa lỗi AI trong "học với AI"; thiết kế lại phần điền đáp án.
- SemVer: MINOR → **0.7.0** (sửa hành vi sản phẩm + endpoint mới `/api/attempt/assist` + cột mới). Plan12 bậc thang phiên bản được cập nhật ở §Quyết định bị thay thế.
- Owner: root (contract, nghiệm thu). Worker theo WP (agent thực thi cùng phiên, mỗi WP một tập file rời nhau).
- Input: docs/ROOT_LOGIC_REVIEW_2026-09-17_FULL_REPO.md; bằng chứng live local 2026-09-17 22:5x (mục dưới); Plan11/12 contracts; não.
- Environments: local SQLite tạm (live smoke trên :3100) → vitest/E2E → CI → Production (user deploy sau khi đổi env `VYCE_*`).

## Bằng chứng live trước khi sửa (2026-09-17 22:50+07, app local trên DB tạm, Vyce thật)

| Đường | Kết quả | Độ trễ |
|---|---|---|
| Login credentials `learner@example.com` | 302 + session role LEARNER | — |
| `GET /api/learner/next-action` | CALIBRATE → Mission `lost-luggage` | — |
| `POST /api/learning-sessions` MISSION | 201, AI mở đầu | 8.5s |
| `POST .../turns` (câu sai ngữ pháp) | 201, coach phản hồi | 7.4s |
| `POST /api/tutor` | 200, trả lời tiếng Việt | 7.1s |
| `POST /api/learning-sessions` LESSON_COACH (khi Mission còn ACTIVE) | **409 ACTIVE_SESSION_EXISTS** | — |
| `POST /api/learner/personalized-lessons` | **503 AI_UNAVAILABLE**, upstream **HTTP 524** (Cloudflare origin timeout) | 125s |

Kết luận cho việc 2 của user ("AI trong học với AI đều lỗi"): hai nguyên nhân sản phẩm thật — (i) sinh bài AI riêng 2.200 token vượt ngưỡng gateway Vyce (~100s) nên **luôn** 524 với model hiện tại; (ii) một Mission mở dở (không evidence) khoá mọi nút "Học cùng AI" khác bằng 409 và không có lối thoát trên UI. Không phải lỗi cấu hình (đã loại trừ bằng probe và log `provider=vyce model=claude-sonnet-4-6`).

## Nhật ký quyết định

- 2026-09-17 22:30+07: User chọn sửa hết findings, ưu tiên auth (login/logout/forgot password); báo AI "học với AI" lỗi; yêu cầu phần điền đáp án sáng tạo hơn cách truyền thống. Root lập Plan13 (MINOR → bắt buộc bộ SPEC).
- 2026-09-17 22:50+07: Root dựng app local trên SQLite tạm với Vyce thật, đăng nhập thật và đo từng endpoint (bảng trên). Chốt nguyên nhân AI: 524 gateway cho generation dài + bẫy ACTIVE_SESSION_EXISTS.
- 2026-09-17 23:00+07: Quyết định thiết kế cho sinh bài AI riêng: **(a) rút gọn output** xuống cỡ Mission (~1.300 token: 4 từ, 4 bài tập, transcript ≤ 600 ký tự, bỏ trường tuỳ chọn) — đây là mức đã đo ổn định 7–10s; **(b) chuyển sang bất đồng bộ** (202 + row GENERATING + client poll) để không request nào phụ thuộc `maxDuration`. Giữ timeout provider 180s (quyết định 18:50) làm trần cứng.
- 2026-09-17 23:00+07: Answer Canvas (việc 3): thay textarea đơn bằng canvas 3 chế độ **Gõ tự do / Ghép mảnh / Viết dần** + lớp **Cược tự tin**; mọi trợ giúp đi qua `POST /api/attempt/assist` do server quyết định và tính vào `hintCount` (trừ mastery theo `HINT_PENALTY`). Chấm điểm vẫn 100% server qua `/api/attempt`. Vùng cấm: không STT, không đưa đáp án đầy đủ xuống client ngoài mức trợ giúp đã trả giá.
- 2026-09-17 23:05+07: Phân WP A–E cho worker song song với tập file rời nhau (bảng dưới). Root giữ quyền nghiệm thu bằng live smoke lại trên :3100 + vitest/E2E/type-check/lint.

- 2026-09-17 23:15+07: Root nghiệm thu local xong (ledger ở TESTING-ACCEPTANCE). Hai điều chỉnh nhỏ ngoài spec: (a) `ENRICHMENT_LEASE_MS` 30 s → 210 s (worker B, đúng bất biến lease > call dài nhất); (b) assist `skeleton` trả mảng `{length, first?}` kèm `skeletonText` (01-CONTRACTS viết `string`, SPEC-P133 viết mảng; chọn mảng). Cosmetic còn mở: feedbackVi bài AI riêng ghép "Chưa đúng." với câu model bắt đầu "Đúng! …"; không sửa lượt này. Version giữ 0.6.0 tới khi CI xanh (01-CONTRACTS). Chưa commit — user quyết.

## Quyết định bị thay thế

- Plan12 01-CONTRACTS bậc thang "0.7.0 = Preview disabled/enabled + mail Preview" → **thay bằng** "0.7.0 = Plan13 remediation + Answer Canvas (local + CI)"; các mốc hosted của Plan12 dời lên 0.8.0+ (không xoá, chỉ dời).
- Plan12 quyết định 18:50 "giữ `AI_REQUEST_PENDING_LEASE_MS` 30s vì lease chỉ chống bấm dồn" → **thay bằng** lease có heartbeat/`expiresAt` ≥ 210s (SPEC-P131 §Lease), vì đo thực tế cho thấy call thứ hai được dispatch và tính tiền khi call một còn chạy.
- Plan12 "P126 backup drill PASS 100% data fidelity" → **hạ cấp** thành "synthetic, chưa phải bằng chứng" (D4); SPEC-P134 định nghĩa drill thật.
- Plan07 verifier "27 bảng / 48 index / 45 FK" → **thay bằng** hợp đồng sinh từ `schema.prisma` hiện hành (SPEC-P134).

## Work packages + Model Tier

| WP | Owner / tier | Deliverable | Files (rời nhau) | Status |
|---|---|---|---|---|
| P130 | Worker A / high (root re-review) | Auth: A1 A2 A3, role refresh, logout sạch, CSP/HSTS, teacher PUT validate, teacher pages owner-scoped, TEACHER không ghi learner API | `src/server/auth/**`, `src/app/api/account/**`, `src/app/api/register/**`, `src/app/api/teacher/lesson/**`, `src/app/teacher/**`, `src/app/login|forgot-password|reset-password|verify-email/**`, `src/components/app-shell.tsx`, `src/proxy.ts`, `next.config.ts`, `src/server/email/**`, `src/server/validation/schemas.ts` (chỉ auth schema) | ✅ local |
| P131 | Worker C / high | AI reliability: AI1–AI4, S1, S2, PL1, PL2, retry-after, 400, generate-lesson map, D5, personalized compact + async | `src/server/ai/**`, `src/server/learning/**`, `src/features/learning-session/**`, `src/app/learner/session/**`, `src/app/api/learning-sessions/**`, `src/server/personalized-learning/**`, `src/app/api/learner/personalized-lessons/**`, `src/app/learner/personalized-lessons/**`, `src/server/services/lesson-authoring.ts`, `src/app/api/teacher/generate-lesson/**`, `prisma/migrations/2026091723*` (cột mới), `src/app/learner/dashboard/**` | ✅ local |
| P132 | Worker B / high | Learning correctness: L1–L6, D1, P1a, G1, pool, planner revision, UTC, mastery unify, recommendation take, events cap, audioText leak, clientTurnId ns, reducer ABANDONED | `src/server/services/learning.ts`, `src/core/text/**`, `src/core/assessment/**`, `src/core/learner-model/**`, `src/app/learner/lessons/[lessonId]/page.tsx`, `scripts/import-dataset.ts`, `src/app/learner/flashcards/**`, `src/app/api/attempt/route.ts`, `src/app/api/flashcard/**`, `src/server/adaptive-games/**`, `src/core/recommendation/**`, `src/app/api/recommendation/**`, `src/server/learning/planner.ts`, `src/server/personalized-learning/calibration*.ts` + SQL calibration trong `service.ts` (phối hợp C: chỉ hàm `atomicPersonalizedCalibrationUpdate`), `src/app/api/learner/timeline/**` | ✅ local |
| P133 | Worker D / high | Answer Canvas: `/api/attempt/assist`, canvas 3 chế độ + cược tự tin trên lesson page và personalized player | `src/app/api/attempt/assist/**` (mới), `src/server/services/attempt-assist.ts` (mới), `src/features/answer-canvas/**` (mới), `src/app/learner/lessons/[lessonId]/lesson-client.tsx`, `src/app/learner/personalized-lessons/[lessonId]/personalized-lesson-player.tsx` (chỉ phần input), `src/app/api/learner/personalized-lessons/[lessonId]/assist/**` (mới) | ✅ local |
| P134 | Worker E / standard | Ops/docs: D2 runbook, D3 verifier, D4 drill thật, D8 guard, D9 CI path, hookTimeout, xoá `auth`/`auth-wal`, Plan12 header, audit, README | `scripts/**` (trừ import-dataset.ts nội dung answers — thuộc B), `.github/workflows/ci.yml`, `src/server/services/*.integration.test.ts` + `src/server/learning/*.integration.test.ts` (chỉ timeout), `docs/**`, `planning/12*/plan.md`, `README.md` | ✅ local |
| P135 | Root | Nghiệm thu: live smoke lại trên :3100 (9 bước + async poll + assist), vitest/E2E/type-check/lint/build, cập nhật não, ledger | — | ✅ local (CI ⬜, production ⬜) |

Song song: A, B, C, D, E chạy đồng thời; xung đột duy nhất được biết là `src/server/personalized-learning/service.ts` (C sở hữu file; B chỉ gửi patch SQL calibration cho C qua root) và `src/server/validation/schemas.ts` (A: auth schema; B/D không đụng).

## Checklist thực thi

- [x] Boot não, review toàn repo, gỡ Kira (đã xong trước Plan13).
- [x] Live smoke trước sửa (bảng bằng chứng).
- [x] Viết bộ SPEC Plan13 (00, 01, P130–P134, OPERATIONS, TESTING-ACCEPTANCE).
- [x] P130 auth — worker A (134 test; follow-up: pad 600 ms, after() sau pad, equalizer bcrypt/token ở cả hai nhánh; live TTFB known/unknown chênh ≤ 32 ms).
- [x] P131 AI reliability — worker C (262 test; follow-up: chuẩn hoá draft trước Zod + log path Zod; live: vocabulary READY 20 s, listening READY 42 s).
- [x] P132 learning correctness — worker B (47 test mới; L1/L2/L3/L4/L5/L6/G1 đỏ-trước-xanh-sau).
- [x] P133 answer canvas — worker D (29 test + 3 E2E; follow-up: gắn vào player bài AI riêng + cột hintCount/confidence/assistMode).
- [x] P134 ops/docs — worker E (verifier self-test exit 0; drill thật 32 bảng/363 row; migration-verifier.test 9/9; audit KHÔNG nâng vì cần prisma major).
- [x] P135 root nghiệm thu local: type-check 0; eslint 0 lỗi/28 cảnh báo; vitest 110 file/684 test (1 timing test flake dưới tải → nới 150 ms ở unit, live giữ 50 ms); Playwright 32/32 (3 spec cập nhật theo contract mới: intentRevision null, study minutes theo responseTimeMs, selector Gợi ý exact); build PASS; live smoke v2 PASS.
- [ ] User: đổi env Vercel sang `VYCE_*`, deploy, xác nhận trên production.

## SPEC router (đọc theo thứ tự)

| Thứ tự | Contract | Phạm vi |
|---|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, bất biến, vùng cấm |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) | Schema/DDL mới, mã lỗi, hằng số, version |
| 3 | [SPEC-P130-AUTH-FLOWS](specs/SPEC-P130-AUTH-FLOWS.md) | Đăng nhập/đăng xuất/quên mật khẩu/xác minh/role |
| 4 | [SPEC-P131-AI-RELIABILITY](specs/SPEC-P131-AI-RELIABILITY.md) | Lease, phân loại lỗi, thoát kẹt, sinh bài AI riêng compact + async |
| 5 | [SPEC-P132-LEARNING-CORRECTNESS](specs/SPEC-P132-LEARNING-CORRECTNESS.md) | Chấm điểm, mastery, đáp án, calibration, games, planner |
| 6 | [SPEC-P133-ANSWER-CANVAS](specs/SPEC-P133-ANSWER-CANVAS.md) | Điền đáp án sáng tạo, assist endpoint |
| 7 | [SPEC-P134-OPS-DOCS](specs/SPEC-P134-OPS-DOCS.md) | Verifier, drill, CI, vệ sinh, tài liệu |
| 8 | [OPERATIONS](specs/OPERATIONS.md) | Thứ tự chạy, live smoke, rollback |
| 9 | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) | Ma trận test + Exit Gates theo môi trường |
