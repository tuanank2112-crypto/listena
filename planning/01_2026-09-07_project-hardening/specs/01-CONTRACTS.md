# Contracts patch 0.1.1

## Session

- `submitLearningTurn(userId, sessionId, input: SubmitLearningTurnInput)` giữ response `{session, learnerTurn, aiTurn, evidence, intervention, idempotent}`.
- `completeLearningSession(userId, sessionId)` giữ `{session}`; ACTIVE → COMPLETED ghi studyMinutes một lần; retry trả snapshot, ABANDONED → 409.
- Với `input.interventionId`, `evaluateInterventionAnswer(...)` quyết định score/successfulTurn/recovery/phase/feedback trước `applyTutorTurn`. Đáp án sai không được AI tự kết luận thành công. Không lộ validator/acceptedAnswers/correctIndex.
- `GeneratedInterventionSchema`: CHOICE bắt buộc `0 <= correctIndex < options.length`; giữ discriminated API types.

## Auth và content

- `proxy(req: NextRequest)`: đọc đúng Auth.js cookie HTTP hoặc HTTPS theo cấu hình URL; cookie sai/chữ ký sai → /login. Role khác → dashboard tồn tại. Route API vẫn tự auth.
- `submitAttempt(params)`: từ chối exercise thuộc lesson chưa PUBLISHED trước assessment, DB write hoặc AI.
- `GET /api/teacher/lesson/[lessonId]`: teacher chỉ đọc lesson của mình; ADMIN giữ quyền; không có → 404; khác chủ → 403.
- `POST /api/teacher/lesson`: kiểm tra course tồn tại và owner trước tạo; khác chủ → 403; course thiếu → 404.

## SRS và UI

- `learnerRepo.upsertVocabularyMastery(userId, vocabularyItemId, data)`: `correctCount`/`incorrectCount` là số tăng thêm; BẮT BUỘC atomic increment ở update, giá trị ban đầu ở create; không ghi đè lịch sử.
- Flashcards: truy vấn active card có mastery đến hạn hoặc chưa có mastery; lọc đúng user; review thành công loại khỏi queue; lỗi giữ nguyên card cho retry; queue rỗng hiển thị hoàn tất.
- Mỗi intervention mount bằng `intervention.id`, không giữ lựa chọn của challenge trước.

| Phân loại | Caller |
|---|---|
| Unauthorized/Forbidden/Not found | Không mutation, trả 401/403/404 theo endpoint |
| Invalid CHOICE/payload | Zod reject/fallback, không phát challenge bất khả thi |
| Failed flashcard request | Giữ card và hiện lỗi |
| Duplicate completion/turn | Không tăng thời gian/evidence lần nữa |

CẤM sửa public payload/DDL hoặc tạo test gọi provider thật. Bằng chứng bắt buộc: regression HTTP/HTTPS, đúng/sai intervention, completion retry, due filtering, counters tích lũy, teacher owner/admin và draft deny.
