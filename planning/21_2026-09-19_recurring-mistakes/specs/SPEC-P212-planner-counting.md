# SPEC-P212 — Sửa lỗi đếm của planner

File: `src/server/learning/service.ts`, `planner.ts`, `next-action.ts`.

## 1. Lúc ghi

`service.ts` ghi bằng chứng vào learner memory:

```ts
errorType: canonicalErrorType(input.output.detectedError?.type),
```

thay cho `input.output.detectedError?.type ?? null`.

Từ nay mọi lượt mới cộng vào **một** mục cho mỗi họ lỗi. `canonicalErrorType` trả `null` khi không có lỗi, đúng kiểu `MemoryEvidence.errorType?: string | null` sẵn có nên không đổi contract.

## 2. Lúc đọc

`planner.ts` và `next-action.ts` **gộp trước, lọc ngưỡng sau**:

```ts
const recurringError = aggregateRecurringErrors(memory?.recurringErrors ?? [])
  .filter((item) => item.count >= 3)[0];
```

**BẮT BUỘC theo đúng thứ tự này.** Lọc `count >= 3` trên từng mục rồi mới gộp sẽ **loại mất** chính những mục bị chẻ mà việc gộp sinh ra để cứu — tức là giữ nguyên lỗi cũ.

Gộp lúc đọc cũng là lý do **không cần migration**: mục viết trước hôm nay mang kiểu thô, và gộp lũy đẳng nên chúng về đúng họ ngay lần đọc kế tiếp.

## 3. Câu tiếng Việt

Cả hai file bỏ bản sao `formatErrorType` và dùng `recurringError.labelVi.toLowerCase()`:

> Bạn đã lặp lại lỗi **thì của động từ** 4 lần gần đây. Hãy sửa lỗi trong một tình huống ngắn rồi thử lại.

thay cho

> Bạn đã lặp lại lỗi **tense** 4 lần gần đây. …

`.toLowerCase()` vì nhãn đứng giữa câu. Nhãn nào có danh từ riêng thì phải xử lý riêng — hiện không có.

`goal` gửi cho AI và `basis.skillKey` dùng `recurringError.key` (khoá chuẩn), **không** dùng kiểu thô: prompt và bằng chứng nên nói cùng một từ vựng với hệ thống.

## 4. Vùng cấm

- **CẤM** khôi phục `formatErrorType` ở bất kỳ file nào. Nó từng tồn tại **hai bản** và cả hai đều ghép tiếng Anh vào câu tiếng Việt.
- **CẤM** hạ ngưỡng `count >= 3` để "bù" cho việc đếm chẻ. Sau khi gộp, ngưỡng 3 lại có nghĩa đúng như thiết kế ban đầu.
- **CẤM** viết lại `LearnerMemory.errorsJson` bằng script chuẩn hoá. Gộp lúc đọc đã đủ và không đụng dữ liệu người dùng.

## 5. Bằng chứng khác biệt thật

Hai test trong `planner.test.ts` ghim đúng lỗi đã sửa:

- **"counts one mistake once, however the model spelled it"** — hai mục `count: 2` (`tense` và `verb_tense`). Trước thay đổi: không mục nào đạt 3, planner **không** trả `PRACTICE`. Sau: `PRACTICE` với `reasonCode: RECURRING_ERROR`.
- **"names the mistake in Vietnamese, never in the model's English"** — `reasonVi` chứa `"thì của động từ"` và **không** chứa `"tense"` hay `"verb_tense"`.
