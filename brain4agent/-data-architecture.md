# Dữ liệu và luồng học

Prisma SQLite; migrations init và add_learning_sessions. Patch0.1.1 không đổi DDL/provider. E2E tạo file DB mới trong temp/listena-e2e-*, apply migrations và seed/import ở đó; không đụng dev.db.

## Model
- User/roles, LearnerProfile.
- Course→Lesson→LessonSegment/Exercise; LessonVocabulary nối VocabularyItem.
- LearningSession→LearningTurn/LearningEvidence/Intervention; AIInteraction trace provider/output/fallback.
- Attempt/AttemptError, VocabularyMastery, Flashcard/ReviewLog, SkillMastery, Recommendation.

## AI-native loop
Dashboard tìm ACTIVE session mới nhất của đúng user hoặc tạo Daily Quest. Repository lấy profile/weak skills/due vocabulary/lesson → orchestrator/retrieval/provider hoặc fallback → server validation → transaction lưu turns/outcome/evidence/mastery → public DTO → reducer/UI.

Intervention validator quyết định output trước state/evidence. Completion auto/manual dùng transition ACTIVE→COMPLETED và tăng phút một lần trong transaction. Unique clientTurnId/sequence ngăn ghi đôi; conflict409.

## Practice hỗ trợ
Attempt chỉ nhận exercise đúng lesson PUBLISHED. Flashcard review kiểm ownership, dùng SM-2; counters là delta atomic. Queue lấy active cards đến hạn hoặc chưa có mastery của user. Client tiến queue sau lưu thành công; retry lỗi giữ card.

## Cache/memory
English dùng voice hệ thống. Vietnamese có Next/Python disk caches, còn thiếu sidecar auth và speed semantics. Kokoro tồn tại legacy nhưng không đăng ký runtime.
Brain lưu kiến thức dự án, không secrets/hội thoại riêng tư của học viên. state.json.current_version là app; brain_template_version là khung não.
