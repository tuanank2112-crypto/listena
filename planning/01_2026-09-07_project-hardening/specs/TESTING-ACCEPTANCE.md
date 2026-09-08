# Ma trận nghiệm thu

Tiêu chí sản phẩm AI-native: người học vào nhiệm vụ AI, trả lời theo ngữ cảnh, nhận coaching/corrective challenge nhất quán, tiếp tục được sau reload và có evidence được lưu. Mission/Quest/Coach là trải nghiệm chính; kiểm tra flashcards/quiz là kiểm tra công cụ ôn/sửa lỗi hỗ trợ, không thay thế nghiệm thu AI loop. Không dùng tỷ lệ tests PASS để suy ra hiệu quả học tập đã được chứng minh.

| Gate | Baseline | Kết quả cuối local |
|---|---|---|
| Vitest | 74 tests / 21 files PASS | Pending |
| Type-check | PASS | Pending |
| ESLint | 0 errors, 38 warnings | Pending |
| Prisma validate | PASS | Pending |
| Prisma migrate status | 2 migrations, up to date | Pending |
| Playwright | Chưa chạy lượt này | Pending |
| Production build | Chưa chạy lượt này | Pending |
| Brain engine --check | Thiếu cấu trúc; đã init | Pending |

Regression BẮT BUỘC: HTTP/secure JWT cookies và role routing; cross-owner teacher denied/admin allowed; draft attempt không assessment/write; CHOICE index theo options.length; correct short intervention không bị chấm sai; wrong intervention không được complete thành công; natural/manual/retry completion không cộng đôi; SRS counters cộng dồn; due cards và queue exhaustion; challenge đổi id reset state. Test mocks boundary I/O được phép; phải ghi rõ gì đã unit mock và gì chạy browser/DB thật.

CẤM check hoàn tất khi còn gate local chưa chạy hoặc thất bại chưa giải quyết. Với failure: lưu case/expected/actual rồi sửa hoặc ghi blocker. Production/VieNeu model inference/live AI là ngoài phạm vi và không được suy từ build/test local.
