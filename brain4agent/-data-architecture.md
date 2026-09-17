# Data and learning flow

## Runtime/storage boundary

**Cảnh báo cấu hình (root review 2026-09-17):** loại database phải suy ra từ `resolveDatabaseConfig()`, KHÔNG đọc `process.env.DATABASE_URL` trực tiếp. Nhánh hosted Turso lấy `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` và không đọc `DATABASE_URL`, nên mọi phép kiểm dựa vào biến đó sẽ chạy nhánh local trên hosted. Đã xảy ra thật ở `isFileDatabase()` trong `libsql-batch.ts` (finding F1).

Prisma/libSQL uses file SQLite for local/E2E and exact APP_RUNTIME=vercel with complete private Turso config for hosted; no local fallback from hosted errors. libSQL local timestamps use Unix milliseconds, hosted uses canonical ISO representation. Target application graph excludes historical Worker/D1/WASM imports. Current additive Prisma migration inventory has 9 applied migrations per Plan10 plus 1 WIP pending (Plan11 receipts); migrations/0001-0003 are historical D1 deployment files.

Canonical staging listena-staging-20260911 is an approved one-way D1 import, never a Preview/Production write target or staging promotion. Historical disposable preview listena-preview-20260912 has schema reconciliation records. No new remote read/write occurred in Plan11 review; final export/cutover/rollback remain Plan07 authority, no reset/seed/dual-write.

## Models
User/roles + emailVerifiedAt, hashed one-time AccountActionToken and FeedbackMessage; LearnerProfile/intent revision/calibration; Course/Lesson/Segment/Exercise/VocabularyItem/joins; LearningSession/Turn/Evidence/Intervention; learner memory and safe AIInteraction traces; owner-private PersonalizedLesson/attempt/vocabulary; AdaptiveGameRun/Round/AdaptiveEvidence; legacy Attempt/AttemptError, Flashcard/ReviewLog, VocabularyMastery, SkillMastery and Recommendation.

Plan10 added Attempt.clientAttemptId/requestHash, ReviewLog.clientReviewId/requestHash, VocabularyMastery.revision and LessonCreationRequest. Uncommitted Plan11 WIP (found 2026-09-17) adds migration `20260916120000_plan11_integrity_receipts`: Attempt.resultJson/enrichmentState(default NOT_REQUESTED)/enrichmentLeaseId/enrichmentLeaseExpiresAt and ReviewLog.resultJson, matching the P110 freeze; it is NOT applied to prisma/dev.db and not accepted (Plan12 P120). Write paths move to `withLibSqlWriteTransaction` (read-in-tx, CAS rowsAffected guard). Attempt writes VocabularyMastery only for error words (revision +1 per write); correct answers leave revision unchanged. Old rows with null resultJson replay as 409 LEGACY_RESULT_UNAVAILABLE.

## AI-native loop
Read-only shared planner combines owned LearningEvidence/AdaptiveEvidence, intent, bounded learner memory/history and due schedules -> primary owned resume/Mission/Coach/Quest -> live provider or typed unavailable -> server validates -> atomic turn/evidence/mastery/memory commit -> private DTO -> learner comeback and evidence-backed continuation. Plan11 makes causal citations match selected skill/error; legacy self-rating is not promoted into server-scored evidence.

Start and turn idempotency already exist. Completion requires evidence, increments time once and distinguishes partial/success. Adaptive game/private lesson grading and hidden validators remain server-owned. GET/render do not create recommendations, call providers or mutate learning state.

## Legacy practice and current qualification
Attempt validates published exercise membership. Flashcard owner checks/SM-2/due queue exist. Post-worker review found a losing ReviewLog remains after committed batch changes[1,0], replay fabricates schedule values, clients retain UUID but recompute hash inputs, and authoring writes course/catalog outside graph batch. These are repair scope, not certified integrity. P111/P112 require real DB fingerprints and full receipt equality.

## Audio/privacy and study data
English uses WebSpeech. Optional Vietnamese Next/Python boundary requires user/shared-key auth, private no-store caching, loopback sidecar and speed1.0 only. Kokoro removed. No speech ability inference from text evidence.
Brain stores project contracts/checkpoints, never secrets or private learner conversations. Pilot raw transcripts/results stay outside git/brain under consent/retention policy; only pseudonymous aggregate receipts/artifact pointers may be tracked. current_version0.5.0 is distinct from brain_template_version1.4.0.
