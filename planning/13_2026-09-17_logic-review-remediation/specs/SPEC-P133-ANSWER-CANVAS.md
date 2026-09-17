# SPEC-P133 — Answer Canvas: điền đáp án khác cách truyền thống

Yêu cầu user: "sáng tạo hơn trong các học phần điền đáp án, khác với cách học truyền thống". Ràng buộc: server vẫn giữ đáp án và chấm; không STT.

## Trải nghiệm

Thay `textarea + Kiểm tra` bằng **Answer Canvas** gồm:

1. **Gõ tự do (FREE)** — mặc định, nhưng ô nhập là "băng chữ" cuộn ngang: mỗi từ đã gõ hiện thành viên (chip) có thể xoá/chèn; hiển thị đếm từ so với gợi ý số từ **chỉ sau khi** dùng SKELETON.
2. **Viết dần (SKELETON)** — bấm "Mở khung" (giá 1 hint): server trả khung `_ _ _ _   _ _ _   _ _` (độ dài từng từ) và chữ cái đầu của ≤ 1/3 số từ (chọn theo seed). Học viên gõ vào từng ô từ; ô tự nhảy khi đủ độ dài. Cảm giác như giải ô chữ.
3. **Ghép mảnh (TILES)** — bấm "Lấy mảnh" (giá 2 hint): server trả các từ của đáp án **xáo trộn** + 2 từ nhiễu từ bài (không thuộc đáp án). Học viên chạm để xếp thành câu; có "nghe lại" đọc câu đang xếp bằng TTS (WebSpeech) để tự kiểm âm.
4. **Cược tự tin (CONFIDENCE)** — trước "Kiểm tra", chọn 1/2/3 "sao"; kết quả hiện "bạn đoán đúng độ chắc chắn" và lịch sử calibration đơn giản (đúng-chắc, đúng-không chắc, sai-chắc, sai-không chắc) trên trang kết quả. Lưu `Attempt.confidence`, `Attempt.assistMode`.
5. **Nghe-đoán trước (PREDICT)** cho bài có audio: nút "Đoán trước khi nghe": ẩn nút nghe 20 giây, học viên gõ dự đoán từ ngữ cảnh, sau đó nghe và sửa. Không đổi grading; chỉ ghi `replayCount` như thường và badge "đoán trước".

Mọi chế độ nộp cùng một chuỗi `submittedAnswer` qua `POST /api/attempt` với `hintCount` = tổng `hintCost` đã dùng + số lần bấm "Gợi ý" cũ, cộng `confidence`, `assistMode`.

## Contract server

### `POST /api/attempt/assist`
```ts
// body
{ exerciseId: uuid, lessonId: uuid, clientAttemptId: uuid, mode: "SKELETON" | "TILES" }
// 200
{ mode, hintCost: 1 | 2, skeleton?: Array<{ length: number, first?: string }>, tiles?: string[] }
// 400 VALIDATION_ERROR | 403 ROLE_FORBIDDEN | 404 (exercise/lesson not PUBLISHED or mismatch) | 429 ASSIST_LIMIT
```
- Implement trong `src/server/services/attempt-assist.ts`: `buildSkeleton(answer, seed)`, `buildTiles(answer, lessonWords, seed)`; `seed = sha256(clientAttemptId + mode)`; thuần, có test.
- Với `answerMode === "open"` (không có đáp án cố định) → 404 (canvas ẩn SKELETON/TILES).
- Từ nhiễu: lấy từ transcript/lesson vocabulary, loại từ thuộc đáp án (sau normalize), ưu tiên cùng độ dài ±1.
- ASSIST_LIMIT: mỗi `(userId, clientAttemptId, mode)` **1 lần** — lưu trong bộ nhớ theo process là không đủ cho serverless → lưu vào `Attempt`? Attempt chưa tồn tại trước khi nộp. Quyết định: **không cần lưu**; giới hạn bằng cách trả **luôn cùng kết quả** cho cùng seed (idempotent) và `hintCost` được client cộng một lần; server tin `hintCount` do client gửi như hiện tại (đã là contract cũ). Ghi rõ trong code comment.

### `POST /api/learner/personalized-lessons/{id}/assist`
- Cùng contract; đáp án lấy từ `validatorJson` của bài READY thuộc user; áp cho `FILL`/`SPELL`.
- Attempt của bài AI riêng: thêm `hintCount` vào `PersonalizedLessonAttempt` payload (schema mới cột `hintCount INTEGER NOT NULL DEFAULT 0` — additive, thuộc migration Plan13; Worker D thêm dòng ALTER vào cùng file migration do C tạo — phối hợp qua root: **D tạo file migration riêng** `20260917230500_plan13_answer_canvas` để không đụng file của C).

## Client

- `src/features/answer-canvas/answer-canvas.tsx` (client component) props: `{ exerciseKey, hasAudio, allowAssist, fetchAssist(mode) => Promise<AssistPayload>, onSubmit({answer, hintCount, confidence, assistMode}) }`; state machine mode FREE|SKELETON|TILES; không chứa fetch trực tiếp (nhận qua props để dùng lại ở 2 nơi).
- `answer-canvas.test.tsx`: reducer thuần `canvas-reducer.ts` test 8 case (thêm/xoá chip, điền skeleton, xếp tile, đổi mode giữ text, tổng hintCost).
- Lesson page: thay khối `textarea`; giữ nút "Gợi ý" cũ (text) là hint miễn phí như trước? Không — gợi ý cũ vẫn +1 hintCount (giữ hành vi).
- Personalized player: dùng canvas cho FILL/SPELL; CHOICE giữ nguyên.
- Trang kết quả attempt: hiện confidence + assistMode.

## Vùng cấm
- CẤM trả toàn bộ đáp án theo đúng thứ tự dưới bất kỳ mode nào trước khi nộp.
- CẤM STT/microphone.
- CẤM lưu assist state ở localStorage (chỉ trong bộ nhớ trang; reload thì mất — chấp nhận).

## Nghiệm thu
- Unit: assist thuần (6), reducer (8), route (4 mã lỗi).
- E2E `e2e/answer-canvas.spec.ts`: mở bài, Lấy mảnh → xếp → nộp → trang kết quả có badge; Viết dần → nộp; hintCount trên Attempt = 3.
