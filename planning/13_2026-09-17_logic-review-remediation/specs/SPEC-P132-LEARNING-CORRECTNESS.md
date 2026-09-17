# SPEC-P132 — Đúng đắn của chấm điểm, mastery, đáp án, calibration, games, planner

Findings: L1, L2, P1a (P1); L3–L6, D1, G1 (P2); pool, planner revision, UTC, mastery unify, recommendation take, flashcard dedupe, receipt ids, extra-word items, events cap, audioText leak, clientTurnId ns, reducer ABANDONED, study minutes (P3).

## 1. Mastery (L1)
- `src/server/services/learning.ts`: `attemptScore: assessment.spellingAccuracy` và `assessment.contentWordAccuracy` (bỏ `/100`). Thêm assert dev: `0 ≤ x ≤ 1`.
- Test: dictation đúng 100% → spelling/vocab mastery **tăng**; sai toàn bộ → giảm.

## 2. Đáp án không xuống client (L2)
- `src/app/learner/lessons/[lessonId]/page.tsx`: `toPublicExerciseMetadata(metadata)` chỉ giữ `{content, answerMode, unit, exerciseNumber}`; CẤM `answers`, `sourceAnswers`, `correctAnswer`.
- `scripts/import-dataset.ts`: vẫn ghi `answers` vào metadata (server dùng) — không đổi; nhưng thêm test cho hàm public projection.
- Kiểm tra tương tự `lastAttemptMap`: chỉ `{score}` (page.tsx map).

## 3. Chuẩn hoá văn bản (L3)
- `src/core/text/normalize.ts`: NFKC → thay `[‘’ʼ]` bằng `'`, `[“”]` bằng `"`; regex ký tự cho phép `/[^\p{L}\p{N}\s']/gu`. Giữ hạ chữ thường bằng `toLocaleLowerCase("en")`. Test: "don’t"=="don't"; "café" giữ é; "thực đơn" nguyên vẹn.

## 4. Attempt (L4, L5, L6/D1, receipt ids, extra-word)
- L4: `if (exercise.lessonId !== params.lessonId) throw new Error("Exercise does not belong to the lesson")`.
- L5: flashcard per `(userId, vocabularyItemId)` **duy nhất và active**: trước INSERT, `SELECT id FROM Flashcard WHERE userId=? AND vocabularyItemId=? AND active=1`; có → tái dùng id (không insert). Migration không cần unique (giữ index), logic đảm bảo.
- Receipt: dựng `flashcardIds` trước khi stringify receipt (đưa vòng lặp tạo id lên trước) — replay trả đúng ids.
- Extra-word: CHỈ tạo VocabularyItem/flashcard từ `error.expected` (từ trong đáp án); `EXTRA_WORD` (expected rỗng) không tạo item. Lemma phải khớp `/^[\p{L}'-]{2,}$/u`.
- L6/D1: enrichment PENDING quá lease 30s: replay **finalize bằng kết quả tất định** (assessment đã có trong Attempt: `score`, errors) — ghi `resultJson` receipt từ dữ liệu đã lưu, `enrichmentState='SKIPPED'`, trả 200. Finalize UPDATE kiểm `rowsAffected===1`, ngược lại log + ném `LegacyResultUnavailableError`.

## 5. Calibration (P1a) — chủ sở hữu file là Worker C; Worker B viết hàm SQL mới trong `src/server/personalized-learning/calibration-sql.ts` và C nối vào
- CEFR chỉ đổi khi: (a) `calibrationStatus` chuyển từ khác-CALIBRATED sang CALIBRATED (lần đầu), hoặc (b) đã CALIBRATED và `calibratedAt` (hoặc `levelChangedAt` mới — dùng cột `LearnerProfile.calibratedAt` làm mốc đổi bậc) cách nay ≥ **7 ngày** và ngưỡng đạt trên **24 evidence gần nhất có ít nhất 12 evidence sau mốc**. Mỗi lần đổi bậc set `calibratedAt = now`.
- Test SQL trên SQLite tạm: 5 attempt đúng liên tiếp sau calibrated → đúng 1 bậc; thêm 5 nữa trong cùng ngày → không đổi.

## 6. Games (G1, pool)
- Pool: chọn 56 ứng viên bằng `ORDER BY` ngẫu nhiên theo seed run (SQLite: `ORDER BY substr(hex(sha256?),...)` không có → dùng `ORDER BY ((rowid * 2654435761) % ?seed)`… đơn giản: lấy tối đa 300 theo `lemma`, rồi xáo trong Node bằng PRNG seed của run (`mulberry32(hash(runId))`) và cắt 56). Mastery due lấy cho pool đã chọn.
- Distractor: từ pool loại target, xáo bằng PRNG seed `hash(runId + roundIndex)`, lấy N-1 nghĩa khác nhau. Test: 2 round liên tiếp cùng target → tập distractor khác nhau với xác suất > 0.9 trên 20 lần.

## 7. Planner & recommendation
- `planner.ts:173`: `intentRevision: intent.revision ?? null` (string) — cập nhật kiểu CausalBasis; test.
- Daily quest day key: `new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now)`; hằng `PLANNER_TIME_ZONE`.
- `/api/recommendation`: `take: 200` attempts (orderBy createdAt desc), `take: 50` sessions.

## 8. Mastery hợp nhất
- Một hàm `applySkillMasteryUpdate({old, score, difficulty, source})` trong `src/core/learner-model/skill-mastery.ts`: `alpha = source==="game" ? 0.18 : 0.2`, `performance = clamp(score * (1/clamp(difficulty,0.6,1.8)), 0, 1)`, `new = old + alpha*(performance-old)`. Cả games và personalized dùng hàm này; SQL mirror trong personalized cập nhật theo công thức này.

## 9. Session nhỏ (Worker B chỉ sửa file thuộc mình; các mục dưới thuộc `src/server/learning/**` do Worker C sở hữu → C thực hiện theo đặc tả này)
- Events cap 200/session → 429 `EVENT_LIMIT`; ABANDON trên COMPLETED không insert.
- `enforceNoAnswerLeak` kiểm cả `spec.audioText`, `spec.placeholder`.
- `clientTurnId` từ client CẤM bắt đầu bằng `ai:`/`event:`/`system:` (zod regex) → 400.
- Reducer: ABANDONED → view `completed` với `outcome: "ABANDONED"`.
- Study minutes: tổng `responseTimeMs` của learner turns + 30s/turn AI, cap 120 (thay wall-clock).

## Vùng cấm
- CẤM đổi SM-2, HINT_PENALTY, thang điểm overall 0–100.
- CẤM xoá dữ liệu flashcard trùng đã có (chỉ ngừng tạo mới; trang flashcards gộp theo vocabularyItemId khi hiển thị).

## Nghiệm thu
- Unit theo từng mục (≥ 25 test mới). Integration real-SQLite cho L5/L6 và calibration.
