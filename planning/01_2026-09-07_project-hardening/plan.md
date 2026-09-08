# Kế hoạch #01 — Rà soát và ổn định ListenAI

- STT: 01
- Trạng thái: IN PROGRESS
- Bắt đầu: 2026-09-07 (Asia/Saigon)
- Hoàn tất: chưa nghiệm thu
- Phiên bản mục tiêu: 0.1.1 (PATCH)
- Phạm vi nghiệm thu: local; production deployment là backlog riêng.

## Nhật ký quyết định

- 2026-09-07: Đọc toàn bộ các nhóm mã nguồn qua root và hai agent audit; đối chiếu báo cáo lịch sử với source. Baseline: 74 tests/21 files, type-check PASS, lint 0 errors/38 warnings, Prisma validate và migrate status PASS.
- 2026-09-07: Dùng bản tải từ Fitc84/brain4agent.old (engine 1.7.2, template 1.4.0). Engine chẩn đoán thiếu não, đã khởi tạo, giữ nguyên hướng dẫn Next.js.
- 2026-09-07: Ưu tiên lỗi có đường tái hiện; giữ API payload, SQLite và AI fallback hiện hành. Dùng database E2E riêng để không reset dữ liệu học thật.
- 2026-09-07 (chỉ đạo sản phẩm của người dùng): ListenAI là nền tảng TỰ HỌC TIẾNG ANH AI-NATIVE. Ưu tiên vòng lặp AI nhiệm vụ → learner response → feedback → comeback → evidence → bước học thích ứng. Lesson, quiz và flashcard là công cụ hỗ trợ trong vòng lặp, không là mô hình điều hướng học truyền thống. Định hướng này áp dụng cả patch hiện tại và roadmap tiếp theo.
- Quyết định bị thay thế: Không có.

## Phân công

| Gói | Người thực hiện | Model/tier | Sở hữu |
|---|---|---|---|
| P01 — Session correctness | backend_audit | Astra / đỏ | src/server/learning/** |
| P02 — UI comeback và SRS queue | ui_tts_audit | Sol / cam | flashcards pages/client, intervention mount, related UI tests |
| P03 — Bộ đếm SRS | brain_locate | Luna / xanh | src/server/repos/learner.ts và test |
| P04 — Auth, visibility, contracts | root | orchestrator / đỏ | proxy, teacher/attempt routes, validation |
| P05 — Verification, docs, brain | root | orchestrator | cấu hình E2E, docs, planning, brain4agent |

## Checklist

- [x] Rà soát module và chạy baseline.
- [x] Xác nhận nguồn skill và khởi tạo bộ nhớ theo engine.
- [x] Viết spec và khóa quyền sửa file giữa agent.
- [x] Ghi định hướng AI-native và tiêu chí nghiệm thu trải nghiệm chính.
- [ ] P01: Validator quyết định outcome; hoàn tất cộng thời gian đúng một lần.
- [ ] P02: Reset intervention; flashcards chỉ ôn thẻ đến hạn và kết thúc queue.
- [ ] P03: Bộ đếm correct/incorrect cộng dồn.
- [ ] P04: HTTP/HTTPS auth, lesson/course ownership, draft access, CHOICE index validation.
- [ ] P05: Unit/type-check/lint/Prisma/E2E/build; cập nhật bằng chứng.
- [ ] Đồng bộ docs, kernel, index, roadmap, changelog, hot memory và version.

## Router spec

- [Kiến trúc](specs/00-ARCHITECTURE.md)
- [Contracts](specs/01-CONTRACTS.md)
- [Vận hành](specs/OPERATIONS.md)
- [Nghiệm thu](specs/TESTING-ACCEPTANCE.md)
