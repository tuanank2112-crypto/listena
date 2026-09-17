# SPEC-P131 — Độ tin cậy AI: lease, phân loại lỗi, thoát kẹt, sinh bài AI riêng

Findings: AI1–AI4, AI2, S1 (P1), S2, PL1, PL2, D5, retry-after, 400, generate-lesson map. Bằng chứng live: 524 ở 125s cho 2.200 token; 7–10s cho ~1.200 token; 409 ACTIVE_SESSION_EXISTS chặn "Học cùng AI".

## 1. Lease ≥ thời gian call (AI1)
- `AI_REQUEST_PENDING_LEASE_MS = 210_000`; `START_REQUEST_PENDING_LEASE_MS = 210_000`.
- Reservation ghi `leaseExpiresAt = now + 210s` (cột mới). `evaluateAICallBudget` coi pending khi `leaseExpiresAt > now` (fallback `createdAt + lease` cho row cũ NULL).
- Settle (success/fail) luôn xoá pending; **mọi** đường lỗi sau reserve phải settle (AI3, D5, lesson-authoring 557-584): bọc bằng `try/finally` với cờ `settled`.
- Test: reserve rồi reserve lại ở t=31s → `AI_REQUEST_LIMIT reason ACTIVE`; ở t=211s → allowed.

## 2. Phân loại lỗi lúc start (AI2, S2, P3 429/5xx)
- `knownStartFailure(error)` mở rộng: `AI_MISCONFIGURED` → FAILED; `AI_RATE_LIMITED` → FAILED **kèm** `retryAfterSeconds` lưu vào ledger và trả 503 + `Retry-After`; `AI_UNAVAILABLE` với reason ∈ {`timeout`,`network_failure`,`upstream_failure`,`invalid_response`,`invalid_json`,`schema_validation_failed`} → vẫn UNKNOWN **chỉ nếu** reservation đã settle success không xác định — thực tế provider ném ⇒ không có session → **FAILED** (không có gì đã commit; billed-or-not không đổi trạng thái học tập). UNKNOWN chỉ còn dành cho lỗi **sau** khi provider trả về (persist batch/DB).
- `DatabaseUnavailableError` trước khi gọi provider → FAILED với `retryAfterSeconds: 5`.
- Provider: 400 → `AIUnavailableError(reason "upstream_invalid_request")`, Retry-After 15; chỉ 401/403/404/`model_not_found` là `AIMisconfiguredError`. `parseRetryAfter(null)` → 15.
- `teacher/generate-lesson/route.ts`: map `AIRequestBudgetError`→429+Retry-After; `AIMisconfiguredError`→503 không Retry-After, message của error; `AIRateLimitedError`→503+Retry-After.

## 3. Thoát kẹt phiên (S1)
- Endpoint `POST /api/learning-sessions/{id}/abandon` (owner, idempotent): ACTIVE → ABANDONED, ghi SYSTEM turn `ABANDON`, `completedAt = now`. COMPLETED/ABANDONED → 200 trả nguyên.
- `createLearningSession` khi có session ACTIVE của user: nếu session đó có **0 evidence** và `startedAt` > 2 phút trước hoặc `input.replaceActive === true` → tự ABANDON rồi tạo mới; ngược lại 409 `ACTIVE_SESSION_EXISTS` kèm `activeSessionId` trong thân.
- `StartSessionButton`: khi 409 có `activeSessionId` → hiện hai nút "Tiếp tục phiên đang mở" (link) và "Bắt đầu phiên mới" (gửi lại với `replaceActive: true`).
- `session-player.tsx`: thêm nút "Kết thúc phiên" → nếu evidence ≥1 gọi complete (PARTIAL), else gọi abandon; reducer map ABANDONED → `completed` view với thông điệp "Phiên đã huỷ".
- Planner: session ABANDONED không được RESUME.
- Schema `CreateLearningSessionSchema` thêm `replaceActive: z.boolean().optional()`.

## 4. Bài AI riêng: compact + async (nguyên nhân 524)
- Prompt/schema: `vocabularyCount: "4 to 5"`, `exerciseCount: "exactly 4"`, transcript ≤ 700 ký tự, bỏ `required` cho `ipa/meaningEn/partOfSpeech/exampleSentence`, `maxOutputTokens 1_400`. Zod draft: vocabulary max 5, exercises min 4 max 4, transcript max 700.
- Async: `provisionPersonalizedLesson` tách thành `claimPersonalizedLessonGeneration()` (tạo/cập nhật row GENERATING, `generationStartedAt=now`, `generationAttempt++`, reserve AI) và `runPersonalizedLessonGeneration(rowId, generationKey)` (gọi provider, persist/FAILED). Route POST: claim → trả **202** `{lesson:{id,status:"GENERATING"}, retryAfterSeconds:3}` → chạy `runPersonalizedLessonGeneration` trong `after()` (Next 16 `unstable_after`/`after` từ `next/server`; worker đọc `node_modules/next/dist/docs` để xác nhận tên). Nếu `after` không khả dụng trong runtime hiện tại → `void run().catch(log)` **và** giữ `maxDuration 200`.
- `GET /api/learner/personalized-lessons/{id}` trả `{lesson:{id,status,failureCode?}}` cho GENERATING/FAILED (không 404), READY trả nội dung public như cũ.
- Client `personalized-lessons-client.tsx`: sau 202 điều hướng tới `/learner/personalized-lessons/{id}`; player poll mỗi 3s tối đa 210s, hiện tiến trình (bước: "Đang đọc hồ sơ" → "Đang soạn bài" → "Đang kiểm tra đáp án"); FAILED → nút "Thử lại" (POST lại).
- PL1: stale check dùng `generationStartedAt` (fallback `createdAt`); `assertPersonalizationBudget` dùng `generationStartedAt` và cửa sổ 210s.
- PL2: partial unique index (01-CONTRACTS); submit attempt cho exercise đã có attempt chấm điểm → trả kết quả đã lưu (idempotent theo exercise), không mint evidence mới.

## 5. Teacher AI ledger (AI3, AI4, D5)
- `reserveLessonCreationRequest`: PENDING với `leaseExpiresAt < now` → chuyển FAILED (`failureCode: "LEASE_EXPIRED"`) bằng CAS rồi cho phép claim mới.
- Sau khi claim, mọi bước (provider config, budget) nằm trong try/catch; lỗi → CAS `PENDING→FAILED`.
- Ghi UNKNOWN/FAILED sau transaction chỉ với guard `WHERE status='PENDING'`.

## Vùng cấm
- CẤM tăng `maxOutputTokens` bài AI riêng > 1.400 hoặc quay lại đồng bộ.
- CẤM tạo session mới mà không ABANDON tường minh phiên cũ (không xoá row).
- CẤM đổi provider timeout 180s / maxDuration 200 (quyết định 18:50).

## Nghiệm thu
- Unit: lease (3), start classification (5), abandon (3), replaceActive (2), compact schema (2), async claim/run (3), teacher ledger (3), retry-after (2).
- Live smoke (root): POST personalized → 202 → poll → READY trong < 60s với Vyce thật (n≥2); Mission → bài học "Học cùng AI" không còn 409 khi Mission rỗng; nút Kết thúc phiên hoạt động.
