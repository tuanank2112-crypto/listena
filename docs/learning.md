# Learning runtime — 1.0.0

ListenAI dùng Mission/Coach/Quest → learner reply → server grading → feedback/comeback → evidence/mastery/memory → bước học tiếp theo. Lessons, games và flashcards hỗ trợ vòng này.

## Session và consistency

`createLearningSession(userId, input)` nạp bài PUBLISHED, learner context và memory đã kiểm tra, gọi orchestrator, rồi lưu opening/session/intervention/audit. `submitLearningTurn(userId, sessionId, input)` kiểm ownership và clientTurnId trước khi gọi AI. Validator của intervention quyết định kết quả trước khi áp dụng state/evidence/mastery, kể cả câu trả lời đúng nhưng ngắn.

Transaction mỗi turn lưu learner/AI turn, evidence, mastery, memory, intervention và state. `appendEvidenceToMemory(tx, userId, evidence)` nhận đúng evidence vừa được tạo, không tìm bản ghi mới nhất sau commit. Ghi memory thất bại làm transaction thất bại. Request trùng clientTurnId trả kết quả đã lưu, không tăng bộ đếm lần nữa.

Memory JSON được kiểm tra từng entry; dữ liệu không hợp lệ bị bỏ qua với log tên field. Cập nhật skill/error không ghi đè goals/preferences. Skill aggregate giữ evidenceCount, masteryScore tốt nhất và lastEvidenceId; đây không phải cùng chỉ số với SkillMastery cập nhật theo evidence/confidence. Orchestrator nhận bản memory giới hạn trong learner context, không dùng role hội thoại giả và không gửi raw memory cho client.

`finalizeLearningSession` dùng conditional ACTIVE→COMPLETED theo owner trong transaction rồi tăng 1–120 phút elapsed một lần. Một session chưa có `LearningEvidence` bị từ chối khi gọi complete: vẫn ACTIVE, không có `completedAt` hay phút học. Manual end có evidence nhưng chưa tới success state được lưu `completionOutcome: PARTIAL`; auto BOSS success là `COMPLETED`. Debrief partial không hiển thị trophy, hướng learner vào remediation; retry hợp lệ không tăng phút. ABANDONED trả 409. Thời gian hiện chưa trừ pause.

Daily Quest đọc tối đa ba scenario key hợp lệ từ Quest thuộc chính learner (ACTIVE/COMPLETED, mới nhất trước) trước lúc gọi planner. Planner tránh scenario gần đây khi còn authored alternative và vẫn có fallback deterministic khi cả ba đã dùng.

Meter nghe/từ vựng/chính tả ở dashboard/progress dùng `SkillMastery` do AI sessions cập nhật; cột `LearnerProfile` chỉ là fallback tương thích nếu skill chưa có record. Điểm display được clamp 0..1, không đồng bộ ngược profile để tránh hai nguồn ghi cạnh tranh.

## Causal Next Action (`p11-v1`)

`planNextLearningAction(userId, now)` trả về `LearningDecision` theo hợp đồng `p11-v1` (tương thích ngược với `p08-v1`).
Trường `basis` (CausalBasis) phản ánh nguồn gốc chính xác của quyết định:
- `EVIDENCE`: kỹ năng yếu hoặc lỗi lặp có bản ghi quan sát thực tế (100% cited refs thuộc đúng skill/error của learner).
- `DUE_REVIEW`: ôn từ vựng đến hạn theo lịch SRS.
- `DECLARED_GOAL`: nhiệm vụ hàng ngày Daily Quest theo mục tiêu và sở thích người học đã lưu.
- `ACTIVE_SESSION`: tiếp tục phiên đang mở dở.
- `INSUFFICIENT_EVIDENCE`: nhiệm vụ khởi động khi chưa có đủ dữ liệu quan sát.

`GET /api/learning-sessions/:id`, `POST /:id/turns`, `POST /:id/complete`, `/api/learner/next-action` dùng chung hợp đồng này. Toàn bộ thao tác lập kế hoạch hoàn toàn read-only (0 ghi DB, 0 gọi provider). Reducer và giao diện giữ nguyên quyết định qua reload trang.

## Timeline, curriculum và SRS

`getLearnerTimeline(userId, windowDays=7)` dùng cửa sổ 7 hoặc 30 ngày để lấy SESSION/EVIDENCE/ATTEMPT/REVIEW thuộc learner, thứ tự giảm dần và tối đa 50 mục. Mỗi query display được giới hạn riêng; tổng phút tuần dùng query độc lập lấy toàn bộ phiên COMPLETED trong [now−7d, now], không phụ thuộc window hiển thị hay limit50.

API `/api/learner/timeline?window=7d|30d` yêu cầu đăng nhập; window khác trả 400, rỗng trả 200 với danh sách rỗng và 0 phút. Dashboard gọi service, progress dùng API, progress API cũ giữ shape và dùng cùng cách tính. Score evidence 0..1 được đổi sang thang100 khi hiển thị; attempt vốn là 0..100.

Danh sách curriculum lọc lesson PUBLISHED, không ràng buộc tên course. Flashcard queue gồm thẻ active đến hạn hoặc chưa có mastery; client tiến queue sau khi lưu thành công, lỗi giữ lại card. Vocabulary correct/incorrect counters dùng atomic increments. Các luồng attempt/review legacy vẫn cần đợt đánh giá transaction riêng.

## Quyền truy cập và audio

API tự kiểm auth; session chỉ đọc/ghi của owner. Teacher lesson/course yêu cầu owner hoặc ADMIN. DTO không chứa validator, acceptedAnswers/correctIndex hoặc raw learner memory. Proxy xử lý HTTP/HTTPS cookie theo cấu hình auth.

English runtime dùng Web Speech qua chính sách giọng chọn lọc và văn bản đã chuẩn hoá (`speakCurated`); AI turn mang `voiceScript` do server dựng; `POST /api/voice/pronunciation` chấm transcript STT trình duyệt và ghi `VOICE_PRACTICE` vào sổ sự kiện phiên (Plan14, ADR 0002). Với `ELEVENLABS_API_KEY`, giọng chính là ElevenLabs qua `POST /api/voice/tts` (giọng chọn lọc từ tài khoản, xem ADR 0003); đáp án ẩn của game/bài riêng đọc qua route audio server-side. Vietnamese gọi route TTS yêu cầu đăng nhập; app/sidecar cùng TTS_API_KEY. Cache proxy mới ngoài public, response private/no-store; thiếu sidecar hoặc key có thể dùng Web Speech fallback tùy giọng trên thiết bị. Xem README/ADR và test TTS cho contract chi tiết.

## Bằng chứng

[Plan04 acceptance](../planning/04_2026-09-10_learning-integrity-truth/specs/TESTING-ACCEPTANCE.md) là nguồn kết quả hiện tại. Vitest kiểm contracts/core với mocks; E2E dùng Next + SQLite thật trong thư mục temp và mock tutor. Không suy ra hiệu quả sư phạm, chất lượng giọng thật hoặc production readiness từ các kiểm tra local.
