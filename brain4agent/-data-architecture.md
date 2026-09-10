# Dữ liệu và luồng học

Plan07's local candidate uses Prisma/libSQL with file-backed SQLite for local development and E2E; Turso is selected only by exact `APP_RUNTIME=vercel` plus complete server-only Turso configuration. Missing, partial or inherited hosted settings fail closed rather than open local SQLite. The former request-scoped Cloudflare D1 path is not part of the target Vercel graph; the deployed Cloudflare Worker+D1 remains a historical rollback asset. DDL is forward-only through `migrations/0001`–`0003`; the historical production curriculum recovery was a reviewed idempotent upsert import, never reset/seed. E2E creates a temporary `listena-e2e-*` database and never touches `dev.db`, historical production D1, or a Turso target.

## Model
- User/roles, LearnerProfile (including calibration state).
- Course→Lesson→LessonSegment/Exercise; LessonVocabulary nối VocabularyItem.
- LearningSession→LearningTurn/LearningEvidence/Intervention; AIInteraction trace provider/output/fallback.
- Attempt/AttemptError, VocabularyMastery, Flashcard/ReviewLog, SkillMastery, Recommendation.
- PersonalizedLesson/PersonalizedLessonVocabulary/PersonalizedLessonAttempt are owner-private artifacts. AdaptiveGameRun/AdaptiveGameRound hold server-only validators; AdaptiveEvidence feeds mastery/calibration.

## Hosting migration boundary
Cloudflare D1 is immutable throughout Plan07 staging: no reset, seed, hand edit, export/import mutation or dual write occurs before a separately approved final export/cutover. A separate Turso staging database must be imported from a read-only D1 snapshot and verified for semantic schema, indexes, foreign keys, integrity, counts, IDs and timestamp evidence; staging is never promoted to production. `MIGRATION_WRITE_MODE=disabled` fences unsafe hosted application API mutations until an explicit, recorded enable. Configuration/transport failures are opaque typed unavailable responses, never a database fallback.

## AI-native loop
Dashboard finds the owner's newest ACTIVE session or creates a Daily Quest. Repositories supply bounded profile/weak-skill/due-vocabulary context → orchestrator/retrieval/live provider or typed unavailable error → server validation → parameterized libSQL atomic batch with commit fences persists turns/outcome/evidence/mastery → public DTO → reducer/UI. Local raw SQL uses Unix-millisecond timestamps; Turso mode uses canonical ISO timestamps. Personalized generation follows the same privacy boundary and persists a source snapshot hash/provenance.

Intervention validator decides output before state/evidence. Completion auto/manual uses ACTIVE→COMPLETED and increases minutes once in a transaction. Unique clientTurnId/sequence prevents duplicate writes. Adaptive-game and personalized-lesson answer IDs are also idempotent and their correct answers never reach the browser.

## Practice hỗ trợ
Attempt chỉ nhận exercise đúng lesson PUBLISHED. Flashcard review kiểm ownership, dùng SM-2; counters là delta atomic. Queue lấy active cards đến hạn hoặc chưa có mastery của user. Client tiến queue sau lưu thành công; retry lỗi giữ card.

## Cache/memory
English dùng voice hệ thống. Vietnamese có Next/Python disk caches, còn thiếu sidecar auth và speed semantics. Kokoro tồn tại legacy nhưng không đăng ký runtime.
Brain lưu kiến thức dự án, không secrets/hội thoại riêng tư của học viên. state.json.current_version là app; brain_template_version là khung não.
