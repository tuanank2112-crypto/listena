# SPEC-P121 — Đóng phần còn lại của Plan11 P111/P112

Contract kỹ thuật: [Plan11 SPEC-P111-INTEGRITY](../../11_2026-09-16_ai-native-evidence-gates/specs/SPEC-P111-INTEGRITY.md). File này chỉ liệt kê **phần còn thiếu sau P120** và cách chứng minh; không định nghĩa lại service.

## Phần còn thiếu (đối chiếu WIP với Plan11 ma trận T111/T112)

| Case Plan11 | Trạng thái sau P120 | Việc P121 |
|---|---|---|
| T111-01 | có (integration) | thêm biến thể review 20 same-key; thêm race "unique conflict → readback" bằng cách xoá mutex/retry và kiểm không có 500 |
| T111-02a/b, 03a/b, 04 | P120 | rerun trong CI |
| T111-05 | có một phần (attempt) | thêm: replay **sau** review khác cùng vocabulary và **sau** unpublish lesson → receipt vẫn bằng lần đầu; replay flashcard sau khi schedule đổi → receipt gốc, không lấy schedule hiện tại; enrichment PENDING → replay 409 `OUTCOME_PENDING`; sau terminal → receipt ổn định |
| T111-06 | **chưa có** | Playwright: submit attempt, chặn response (route abort) → reload → cùng key/body gửi lại → đúng 1 Attempt; đổi đáp án khi pending → UI chặn, sau khi replay 200 mới cho intent mới |
| T112-01 | **chưa có** | Playwright trên trang `/teacher/lessons/new` thật: manual tạo được lesson owned → điều hướng; AI với provider stub test-only → lesson tạo được; reload giữa chừng → cùng `clientRequestId` |
| T112-02 | **chưa có** | fault-injection tại **từng** statement của graph (course, vocab, lesson, segment, exercise, join, trace, receipt, ledger UPDATE) qua wrapper `tx.execute` test-only → fingerprint mọi bảng liên quan không đổi; ledger về `FAILED` (manual) hoặc `UNKNOWN` (ai) đúng nhánh |
| T112-03 | **chưa có** | counter dispatch provider ≤1 dưới: thiếu config, hết quota, timeout sau dispatch, lỗi graph sau output hợp lệ, lỗi settle budget sau commit; FAILED→PENDING recovery race 2 caller → 1 winner |
| T112-04 | có | thêm canary role/owner/opaque error cho `generate-lesson` (log không chứa `error.message`) |

## Contract bổ sung cho fault-injection (test-only)

```ts
// src/test-support/libsql-fault.ts (test-only, không export vào runtime bundle)
type FaultPlan = { failAtStatementIndex?: number; failWhenSqlMatches?: RegExp; error?: Error };
export function withFaultyWriteTransaction<T>(plan: FaultPlan, run: (tx: Transaction) => Promise<T>): Promise<T>;
```

- Wrapper bọc `tx.execute` thật; khi khớp plan → throw trước khi gửi câu SQL đó. Không mock DB; DB là SQLite tạm thật.
- Fingerprint: `SELECT COUNT(*), MAX(rowid), SUM(length(hex(...)))`-style hash cho từng bảng trong danh sách cố định `[Course, VocabularyItem, Lesson, LessonSegment, Exercise, LessonVocabulary, AIInteraction, LessonCreationRequest, Attempt, AttemptError, ReviewLog, VocabularyMastery, LearnerProfile, SkillMastery]`. So khớp trước/sau **trừ** hàng ledger được phép đổi status (ghi rõ).

## Provider stub cho E2E authoring

Dùng stub Responses/Chat Completions **test-process-only** đã có ở `e2e/openai-responses-test-stub.cjs` (hoặc mở rộng cùng chỗ). CẤM thêm selector mock vào runtime. Counter dispatch đọc từ stub (số request nhận được).

## Vùng cấm

- CẤM mock `executeAtomicLibSqlBatch`/`withLibSqlWriteTransaction` trong case atomicity; chỉ inject ở `tx.execute`.
- CẤM E2E dùng `prisma/dev.db`; `e2e/setup.ts` đã tạo DB tạm — giữ.
- CẤM claim exactly-once billing provider; chỉ claim "≤1 dispatch khi outcome biết".

## Ma trận lỗi / caller

Kế thừa Plan11 SPEC-P111 §Error/caller matrix nguyên văn.

## Nghiệm thu P121 (số phải đo, local rồi CI)

- Toàn bộ T111-01…06, T112-01…04 PASS; số case integration + E2E ghi cụ thể (kỳ vọng ≥12 integration, E2E 20 hiện có + ≥3 mới).
- Fault matrix: số statement được inject = số statement trong graph (ghi con số, vd 9/9), fingerprint bằng nhau 100%.
- Dispatch counter: bảng 5 kịch bản × giá trị đo (0 hoặc 1).
- Coverage v8 cho `learning.ts`, `lesson-authoring.ts`, `libsql-batch.ts`, `client-intent.ts`: ghi % lines/branches (không đặt ngưỡng trước khi có baseline).
- Ghi requalification vào Plan10 TESTING-ACCEPTANCE mục "Post-worker qualification" (thêm dòng ngày + trỏ receipt) và Plan11 TESTING-ACCEPTANCE cột Local.
