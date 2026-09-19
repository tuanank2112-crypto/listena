# 01 — Contracts

## 1. Lõi phân loại (`src/core/learning/error-taxonomy.ts`)

```ts
export interface ErrorFamily {
  key: string;      // khoá chuẩn, dùng để đếm
  labelVi: string;  // học viên đọc cái này
  hintVi: string;   // một dòng nói họ đang sai chuyện gì
}

export interface CountedError {
  errorType: string;
  count: number;
  lastEvidenceId: string;
}

export interface AggregatedError extends ErrorFamily {
  count: number;
  lastEvidenceId: string;
  rawTypes: string[];   // mọi cách viết đã gộp vào họ này, để chẩn đoán
}

export function canonicalErrorType(raw: string | null | undefined): string | null;
export function describeErrorType(key: string): ErrorFamily;
export function describeRawErrorType(raw: string | null | undefined): ErrorFamily;
export function aggregateRecurringErrors(errors: CountedError[]): AggregatedError[];
```

**BẮT BUỘC:** tất cả là hàm thuần, không đọc DB, không đọc `Date.now()`.

**BẮT BUỘC:** `canonicalErrorType` **lũy đẳng** — `canonicalErrorType(canonicalErrorType(x)) === canonicalErrorType(x)`. Nếu không, chuẩn hoá lúc đọc sẽ phá dữ liệu đã chuẩn hoá lúc ghi.

**BẮT BUỘC:** trả `null` cho chuỗi rỗng, chuỗi chỉ có dấu, `null` và `undefined` — "không có lỗi" phải khác "có lỗi không rõ tên".

## 2. Lịch sử lỗi (`src/server/learning/mistakes.ts`)

```ts
export interface MistakeExample {
  learnerText: string;    // tin nhắn của học viên, nguyên văn; rỗng khi không tìm được lượt
  highlights: string[];   // các mảnh của `actual` THẬT SỰ có trong learnerText
  explanationVi: string;  // lời Coach đã giải thích
  sessionGoal: string;
  occurredAt: string;     // ISO
}

export interface MistakeFamily {
  key: string;
  labelVi: string;
  hintVi: string;
  count: number;
  examples: MistakeExample[];
}

export function buildMistakeHistory(input: {
  recurringErrors: CountedError[];
  turns: StoredTurn[];          // cả LEARNER lẫn AI, để ghép được cặp
  maxFamilies: number;
  maxExamplesPerFamily: number;
}): MistakeFamily[];
```

**CẤM** đưa `detectedError.actual` ra phản hồi. Nó là con trỏ để tô, không phải nội dung để đọc — xem [`SPEC-P213 §1b`](SPEC-P213-mistakes-api.md).

Hai hàm thuần dùng chung nằm ở `src/core/learning/text-highlight.ts`, vì **máy chủ quyết định tô gì, client vẽ**:

```ts
export function findHighlights(learnerText: string, actual: string): string[];
export function segmentHighlights(text: string, highlights: string[]): TextSegment[];
```

**BẮT BUỘC:** `count` lấy từ `recurringErrors` (nguồn của planner), **CẤM** đếm từ `examples.length` khi đã có số trong memory — xem bất biến BB3.

**BẮT BUỘC:** một lượt có `contentJson` hỏng, `detectedError` không phải object, thiếu `type` hoặc thiếu `explanationVi` thì **bỏ qua lượt đó**, không được làm hỏng cả trang.

## 3. Endpoint

### `GET /api/learner/mistakes`

Không nhận tham số. **CẤM** thêm query do client đặt (bất biến BB5).

Phản hồi `200`:

```ts
{
  families: MistakeFamily[];   // tối đa 6, lỗi lặp nhiều nhất trước
  correctedTurnCount: number;  // tổng số ví dụ đang hiển thị
}
```

Hằng số trong route, **không** lấy từ client: `TURN_QUERY_LIMIT = 240`, `MAX_FAMILIES = 6`, `MAX_EXAMPLES_PER_FAMILY = 3`.

### Bảng lỗi và hành vi bắt buộc của caller

| Tình huống | Mã | Caller phải làm |
|---|---|---|
| Không có phiên | `401` | **CẤM** hiện khu rỗng như thể học viên chưa sai lần nào. Layout `learner/` đã đẩy về `/login`. |
| Cấu hình / DB hỏng | mã của `databaseErrorResponse` | **Ẩn cả khu**. Trang Tiến bộ vẫn đầy đủ nếu thiếu nó; một hộp lỗi ở đây chỉ làm nhiễu. |
| Lỗi khác | `500 {error:"Có lỗi xảy ra"}` | Như trên. |
| Học viên chưa có lỗi nào | `200 {families: []}` | **Ẩn cả khu.** Một khung rỗng nói "bạn chưa sai gì" là vô nghĩa với người mới bắt đầu. |

## 4. Contract giao diện

| Thứ | Bất biến |
|---|---|
| `section` của khu | `aria-labelledby="mistakes-heading"` — E2E bám vào mốc này |
| Mỗi họ lỗi | Nút mở/đóng mang `aria-expanded`; họ đầu tiên mở sẵn |
| Chuỗi hiển thị | Chỉ `labelVi` và `hintVi`. **CẤM** in `key` hay kiểu lỗi thô của model |
| Âm thanh | **CẤM** mọi nút nghe trong khu này (vùng cấm Plan14) |
