# Kiến trúc và bất biến

## Định hướng sản phẩm: tự học tiếng Anh AI-native

Theo chỉ đạo người dùng ngày 2026-09-07, AI là cơ chế vận hành trải nghiệm học: lựa chọn mục tiêu cá nhân → tình huống/giao tiếp có ngữ cảnh → quan sát câu trả lời → phản hồi đúng lỗi → thử thách sửa lỗi có thể làm ngay → lưu bằng chứng → điều chỉnh lượt/buổi tiếp theo. AI Mission, Lesson Coach và Daily Quest là entry points chính; resume phải giữ ngữ cảnh thật của người học.

BẮT BUỘC: mọi thay đổi ưu tiên chất lượng vòng lặp này. Server giữ quyền chấm điểm, validator, state và dữ liệu tiến bộ; AI tạo hội thoại/coaching phù hợp trình độ. Flashcards, dictation, quiz và curriculum là tài nguyên hoặc bài sửa lỗi phục vụ mục tiêu AI đã xác định. Không biến sản phẩm thành danh sách bài cố định kèm chatbot ở góc màn hình.

Đợt patch này bảo đảm loop hiện có đáng tin: feedback/validator thống nhất, comeback mới sạch state, memory/evidence/completion không mất dữ liệu. Roadmap tiếp theo ưu tiên learner memory xuyên phiên, next-best action có bằng chứng, nhiệm vụ sinh theo mục tiêu người học và đánh giá kết quả học thật. Voice/STT là khả năng bổ sung, không phải điều kiện duy nhất để gọi là AI-native.

Luồng giữ nguyên: Next App Router → auth/validation → service/repository → Prisma SQLite. Session dùng tutor-orchestrator và deterministic fallback, DTO lọc validator. Core algorithms không I/O.

BẮT BUỘC: Đọc Next 16.3.1 docs cục bộ trước sửa framework. Root giữ quyền sửa shared schema; agent không thay API shape. Session output, state, evidence và mastery phải thống nhất kết quả validator server. Hoàn tất tự nhiên và thủ công dùng cùng semantics thời gian, một lần/session. Flashcard queue phải phản ánh nextReviewAt.

CẤM trong đợt này: đổi provider database/migrations, tái bật model tải ở trình duyệt, deploy dịch vụ trả phí, thay dataset nội dung, reset DB người dùng, gọi AI thật trong tests. Lý do: patch xác minh hành vi hiện tại, tránh gộp thay đổi kiến trúc không có môi trường nghiệm thu.

| Lỗi | Hành vi |
|---|---|
| AI sai/chậm/không khả dụng | Fallback có validator server cho intervention |
| Update session trùng/xung đột | Giữ idempotency hoặc 409, không ghi đôi |
| Thiếu DB E2E | Khởi tạo fixture database riêng |
| Cấu hình production lệch provider | Ghi backlog và runbook; không tuyên bố production ready |

Bằng chứng: baseline 74 tests đạt; các regression mới phải chứng minh lỗi và hành vi sau sửa. Router: CONTRACTS → OPERATIONS → TESTING-ACCEPTANCE.
