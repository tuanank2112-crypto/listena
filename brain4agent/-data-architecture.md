# Dữ liệu và luồng học

Prisma uses local libSQL SQLite and request-scoped Cloudflare D1 in production. DDL is forward-only through `migrations/0001`–`0003`; production curriculum recovery is a reviewed idempotent upsert import, never reset/seed. E2E creates a temporary `listena-e2e-*` database and never touches `dev.db` or production D1.

## Model
- User/roles, LearnerProfile (including calibration state).
- Course→Lesson→LessonSegment/Exercise; LessonVocabulary nối VocabularyItem.
- LearningSession→LearningTurn/LearningEvidence/Intervention; AIInteraction trace provider/output/fallback.
- Attempt/AttemptError, VocabularyMastery, Flashcard/ReviewLog, SkillMastery, Recommendation.
- PersonalizedLesson/PersonalizedLessonVocabulary/PersonalizedLessonAttempt are owner-private artifacts. AdaptiveGameRun/AdaptiveGameRound hold server-only validators; AdaptiveEvidence feeds mastery/calibration.

## AI-native loop
Dashboard finds the owner's newest ACTIVE session or creates a Daily Quest. Repositories supply bounded profile/weak-skill/due-vocabulary context → orchestrator/retrieval/live provider or typed unavailable error → server validation → runtime-specific atomic boundary (native D1 batch in Worker or local transaction) persists turns/outcome/evidence/mastery → public DTO → reducer/UI. Personalized generation follows the same privacy boundary and persists a source snapshot hash/provenance.

Intervention validator decides output before state/evidence. Completion auto/manual uses ACTIVE→COMPLETED and increases minutes once in a transaction. Unique clientTurnId/sequence prevents duplicate writes. Adaptive-game and personalized-lesson answer IDs are also idempotent and their correct answers never reach the browser.

## Practice hỗ trợ
Attempt chỉ nhận exercise đúng lesson PUBLISHED. Flashcard review kiểm ownership, dùng SM-2; counters là delta atomic. Queue lấy active cards đến hạn hoặc chưa có mastery của user. Client tiến queue sau lưu thành công; retry lỗi giữ card.

## Cache/memory
English dùng voice hệ thống. Vietnamese có Next/Python disk caches, còn thiếu sidecar auth và speed semantics. Kokoro tồn tại legacy nhưng không đăng ký runtime.
Brain lưu kiến thức dự án, không secrets/hội thoại riêng tư của học viên. state.json.current_version là app; brain_template_version là khung não.
