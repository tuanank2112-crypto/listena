# 01 — Contracts Plan13

## Version

- `package.json` và `state.current_version`: **0.7.0** chỉ sau khi P135 ✅ local + CI. Trước đó giữ 0.6.0.

## Hằng số (nguồn chân lý sau Plan13)

| Hằng | Giá trị | File |
|---|---|---|
| Provider timeout | 180_000 ms (giữ) | `src/server/ai/vyce-chat-completions-provider.ts` |
| Route `maxDuration` AI | 200 (giữ) | 5 route AI |
| `AI_REQUEST_PENDING_LEASE_MS` | **210_000** | `src/server/ai/request-budget.ts` |
| `START_REQUEST_PENDING_LEASE_MS` | **210_000** | `src/server/learning/service.ts` |
| `GENERATION_STALE_MS` | 210_000 (giữ) | personalized service |
| `PERSONALIZED_LESSON_ACTIVE_WINDOW_MS` | **210_000** | generation-budget.ts |
| Personalized `maxOutputTokens` | **1_400** | personalized service |
| Personalized draft: vocabulary | min 4 **max 5**; exercises min 4 **max 4**; transcript **≤ 700** ký tự; `ipa/meaningEn/partOfSpeech/exampleSentence` **không yêu cầu** (schema JSON bỏ khỏi `required`) | contracts.ts |
| Retry-After fallback khi thiếu header | **15** s | cả 2 provider |
| Auth request routes: thời gian phản hồi tối thiểu | pad tới **≥ 400 ms** kể từ lúc nhận request, **và** gửi mail ngoài đường phản hồi | account routes |
| Login throttle | tối đa **5** thất bại / **10 phút** theo `(email)` và **20** / 10 phút theo IP; khoá **15 phút**; lưu trong bảng `AuthAttempt` | auth config |
| Role refresh | JWT callback re-read `role`/`emailVerifiedAt` từ DB tối đa mỗi **5 phút** (`token.roleCheckedAt`) | auth config |
| Events per session | tối đa **200** row PAUSE/RESUME/HINT/REPLAY; vượt → 429 typed | session service |
| Recommendation history | `take: 200` attempts, `take: 50` sessions | recommendation route |
| Adaptive pool | 56 từ **ngẫu nhiên theo seed run** (không `orderBy lemma`), distractor chọn ngẫu nhiên theo seed | adaptive-games |

## Schema mới (additive; migration `20260917230000_plan13_remediation`)

```sql
-- Đăng nhập: throttle
CREATE TABLE "AuthAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subjectKind" TEXT NOT NULL,         -- 'EMAIL' | 'IP'
  "subject" TEXT NOT NULL,             -- email thường hoá hoặc IP (sha256 hex)
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" DATETIME NOT NULL,
  "lockedUntil" DATETIME,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AuthAttempt_subjectKind_subject_key" ON "AuthAttempt"("subjectKind","subject");

-- Personalized: mốc bắt đầu generation (sửa PL1) + tiến độ async
ALTER TABLE "PersonalizedLesson" ADD COLUMN "generationStartedAt" DATETIME;
ALTER TABLE "PersonalizedLesson" ADD COLUMN "generationAttempt" INTEGER NOT NULL DEFAULT 0;

-- Personalized attempt: chống nộp lại vô hạn (PL2)
-- unique (lessonId, exerciseId, userId) cho attempt ĐÃ CHẤM: dùng partial unique index
CREATE UNIQUE INDEX "PersonalizedLessonAttempt_one_graded_per_exercise"
  ON "PersonalizedLessonAttempt"("lessonId","exerciseId","userId") WHERE "score" IS NOT NULL;

-- AI reservation lease có hạn tường minh (AI1)
ALTER TABLE "AIInteraction" ADD COLUMN "leaseExpiresAt" DATETIME;

-- Attempt: cược tự tin (P133)
ALTER TABLE "Attempt" ADD COLUMN "confidence" INTEGER;          -- 1..3, NULL nếu không cược
ALTER TABLE "Attempt" ADD COLUMN "assistMode" TEXT;             -- 'FREE' | 'TILES' | 'SKELETON'
```

`schema.prisma` phải khớp từng cột. Prisma `@@unique` không biểu diễn partial index → giữ trong migration và ghi chú trong schema (như `LearningSessionStartRequest_one_pending_per_user`).

## Mã lỗi mới / thay đổi

| Code | HTTP | Ý nghĩa | Caller phải |
|---|---|---|---|
| `AUTH_LOCKED` | 429 + `Retry-After` | Quá số lần đăng nhập sai | Hiện "thử lại sau N phút", không tiết lộ tài khoản tồn tại |
| `SESSION_ABANDONED` | 200 (POST abandon) | Phiên đã huỷ | Về dashboard |
| `GENERATION_IN_PROGRESS` | 202 | Bài AI riêng đang sinh | Poll `GET /api/learner/personalized-lessons/{id}` mỗi 3s, tối đa 210s |
| `ASSIST_LIMIT` | 429 | Hết mức trợ giúp cho bài này | Ẩn nút trợ giúp |
| `AI_MISCONFIGURED` | 503, **không** Retry-After | Chỉ 401/403/404 hoặc `model_not_found` | Hiện "báo quản trị" |
| 400 upstream | → `AI_UNAVAILABLE` reason `upstream_invalid_request` | Có Retry-After 15 | Cho thử lại |

## Endpoint mới

- `POST /api/learning-sessions/{id}/abandon` → `{ session }` status ABANDONED; idempotent; owner-only.
- `POST /api/attempt/assist` body `{ exerciseId, lessonId, mode: "SKELETON" | "TILES", clientAttemptId }` → `{ mode, skeleton?: string, tiles?: string[], hintCost: number }`. SKELETON = độ dài từng từ + chữ cái đầu của **tối đa 1/3 số từ**; TILES = các từ đáp án xáo trộn theo seed `sha256(clientAttemptId)` + 2 từ nhiễu lấy từ bài (không phải đáp án). `hintCost` SKELETON=1, TILES=2. Tối đa 1 lần mỗi mode mỗi `clientAttemptId`.
- `POST /api/learner/personalized-lessons/{id}/assist` tương tự cho bài AI riêng (FILL/SPELL), owner-only, chỉ khi lesson READY.
- `POST /api/learner/personalized-lessons` trả **202** `{ lesson: {id,status:"GENERATING"}, retryAfterSeconds: 3 }` khi bắt đầu sinh; sinh chạy trong cùng invocation (`after()` của Next hoặc promise không await có `waitUntil` tương đương) và client poll `GET /{id}` tới READY/FAILED.
