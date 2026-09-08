# Learning runtime — 0.2.1

ListenAI dùng Mission/Coach/Quest → learner reply → server grading → feedback/comeback → evidence/mastery/memory → bước học tiếp theo. Lessons, games và flashcards hỗ trợ vòng này.

## Session và consistency

`createLearningSession(userId, input)` nạp bài PUBLISHED, learner context và memory đã kiểm tra, gọi orchestrator, rồi lưu opening/session/intervention/audit. `submitLearningTurn(userId, sessionId, input)` kiểm ownership và clientTurnId trước khi gọi AI. Validator của intervention quyết định kết quả trước khi áp dụng state/evidence/mastery, kể cả câu trả lời đúng nhưng ngắn.

Transaction mỗi turn lưu learner/AI turn, evidence, mastery, memory, intervention và state. `appendEvidenceToMemory(tx, userId, evidence)` nhận đúng evidence vừa được tạo, không tìm bản ghi mới nhất sau commit. Ghi memory thất bại làm transaction thất bại. Request trùng clientTurnId trả kết quả đã lưu, không tăng bộ đếm lần nữa.

Memory JSON được kiểm tra từng entry; dữ liệu không hợp lệ bị bỏ qua với log tên field. Cập nhật skill/error không ghi đè goals/preferences. Skill aggregate giữ evidenceCount, masteryScore tốt nhất và lastEvidenceId; đây không phải cùng chỉ số với SkillMastery cập nhật theo evidence/confidence. Orchestrator nhận bản memory giới hạn trong learner context, không dùng role hội thoại giả và không gửi raw memory cho client.

`finalizeLearningSession` dùng conditional ACTIVE→COMPLETED theo owner trong transaction rồi tăng 1–120 phút elapsed một lần. Auto/manual completion cùng dùng đường này; retry không tăng phút, ABANDONED trả 409. Thời gian hiện chưa trừ pause.

## Next action

`computeNextAction(userId, sessionId?)` dùng evidence thuộc learner; không có evidence thì trả null. Thứ tự: lỗi lặp có evidence hợp lệ → PRACTICE; kỹ năng yếu và bài phù hợp chưa học → COACH; từ đến hạn → QUEST; còn lại → MISSION hợp lệ khác với phiên vừa học. Không chọn tùy tiện bài cũ nhất rồi tuyên bố phù hợp kỹ năng.

`GET /api/learning-sessions/:id`, `POST /:id/turns`, `POST /:id/complete` giữ payload hiện có và thêm `nextAction` ở envelope khi completed. Trường này có kind, reason, evidenceRefs, và targetId/scenarioKey/goal tùy hoạt động. Computation lỗi được log rồi trả null để kết quả học đã commit vẫn truy cập được.

Reducer giữ nextAction qua submit, complete và reload. Debrief hiển thị lý do cùng CTA. COACH/QUEST truyền lessonId; MISSION truyền scenarioKey; PRACTICE mở Mission với mục tiêu sửa lỗi qua API tạo session hiện có. Không chuyển người cần sửa lỗi sang một queue flashcard trống không liên quan.

## Timeline, curriculum và SRS

`getLearnerTimeline(userId, windowDays=7)` dùng cửa sổ 7 hoặc 30 ngày để lấy SESSION/EVIDENCE/ATTEMPT/REVIEW thuộc learner, thứ tự giảm dần và tối đa 50 mục. Mỗi query display được giới hạn riêng; tổng phút tuần dùng query độc lập lấy toàn bộ phiên COMPLETED trong [now−7d, now], không phụ thuộc window hiển thị hay limit50.

API `/api/learner/timeline?window=7d|30d` yêu cầu đăng nhập; window khác trả 400, rỗng trả 200 với danh sách rỗng và 0 phút. Dashboard gọi service, progress dùng API, progress API cũ giữ shape và dùng cùng cách tính. Score evidence 0..1 được đổi sang thang100 khi hiển thị; attempt vốn là 0..100.

Danh sách curriculum lọc lesson PUBLISHED, không ràng buộc tên course. Flashcard queue gồm thẻ active đến hạn hoặc chưa có mastery; client tiến queue sau khi lưu thành công, lỗi giữ lại card. Vocabulary correct/incorrect counters dùng atomic increments. Các luồng attempt/review legacy vẫn cần đợt đánh giá transaction riêng.

## Quyền truy cập và audio

API tự kiểm auth; session chỉ đọc/ghi của owner. Teacher lesson/course yêu cầu owner hoặc ADMIN. DTO không chứa validator, acceptedAnswers/correctIndex hoặc raw learner memory. Proxy xử lý HTTP/HTTPS cookie theo cấu hình auth.

English runtime dùng Web Speech. Vietnamese gọi route TTS yêu cầu đăng nhập; app/sidecar cùng TTS_API_KEY. Cache proxy mới ngoài public, response private/no-store; thiếu sidecar hoặc key có thể dùng Web Speech fallback tùy giọng trên thiết bị. Xem README/ADR và test TTS cho contract chi tiết.

## Bằng chứng

[Plan03 acceptance](../planning/03_2026-09-08_learning-loop-completion/specs/TESTING-ACCEPTANCE.md) là nguồn kết quả hiện tại. Vitest kiểm contracts/core với mocks; E2E dùng Next + SQLite thật trong thư mục temp và mock tutor. Không suy ra hiệu quả sư phạm, chất lượng giọng thật hoặc production readiness từ các kiểm tra local.
