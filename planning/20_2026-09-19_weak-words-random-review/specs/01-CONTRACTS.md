# 01 — Contracts

## 1. Kiểu dữ liệu (`src/server/learning/weak-words.ts`)

```ts
export interface MasteryRow {
  vocabularyItemId: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number;
  nextReviewAt: Date | null;
}

export type WordStanding = "weak" | "shaky" | "learned";

export interface ReviewWord {
  vocabularyItemId: string;
  displayText: string;
  meaningVi: string;
  ipa: string | null;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number;
  standing: WordStanding;
  dueNow: boolean;
}
```

## 2. Chữ ký hàm (bất biến)

```ts
export function classifyStanding(row: Pick<MasteryRow, "correctCount" | "incorrectCount">): WordStanding;
export function toReviewWord(row: MasteryRow, now: Date): ReviewWord;
export function rankWeakWords(rows: MasteryRow[], now: Date, limit: number): ReviewWord[];
export function selectRandomReview(rows: MasteryRow[], now: Date, count: number, random: () => number): ReviewWord[];
export function countLearned(rows: MasteryRow[]): number;
```

**BẮT BUỘC:** tất cả đều là hàm thuần. `now` và `random` là tham số, **CẤM** đọc `Date.now()` hay `Math.random()` bên trong — nếu không test không ghim được kết quả.

## 3. Endpoint

### `GET /api/learner/vocabulary-review`

Không nhận tham số. **CẤM** thêm query chọn từ, seed, limit do client đặt (bất biến BB3).

Phản hồi `200`:

```ts
{
  weakWords: ReviewWord[];    // tối đa 20, xấu nhất trước
  randomReview: ReviewWord[]; // tối đa 8, máy chủ bốc
  seenCount: number;          // số hàng mastery đã đọc
  learnedCount: number;
  weakCount: number;
}
```

Hằng số (trong route, **không** lấy từ client): `MASTERY_QUERY_LIMIT = 500`, `WEAK_WORD_LIMIT = 20`, `RANDOM_REVIEW_COUNT = 8`.

### Bảng lỗi và hành vi bắt buộc của caller

| Tình huống | Mã | Thân | Caller phải làm |
|---|---|---|---|
| Không có phiên đăng nhập | `401` | `{ error: "Unauthorized" }` | **CẤM** hiển thị dữ liệu rỗng như thể học viên chưa có từ nào. Để `learner/layout.tsx` đẩy về `/login`. |
| Cấu hình DB thiếu/sai | mã của `databaseErrorResponse` | thân đục của helper chung | Hiện thông điệp thử lại. **CẤM** in `error` của máy chủ ra màn hình. |
| DB tạm thời không sẵn sàng | như trên | như trên | như trên |
| Lỗi khác | `500` | `{ error: "Có lỗi xảy ra" }` | Hiện thông điệp thử lại + nút "Thử lại". |

**BẮT BUỘC:** route phải đi qua `databaseErrorResponse(error)` **trước** khi rơi về `500`, đúng khuôn `/api/learner/progress`. Thông điệp cấu hình của máy chủ **CẤM** rò ra thân phản hồi.

## 4. Contract giao diện

| Thành phần | Bất biến |
|---|---|
| `SPELL_SPEEDS` trong `games-client.tsx` | Đúng ba mức `0.75` / `1` / `1.2`, nhãn `Nghe chậm` / `Bình thường` / `Nghe nhanh`. Nhóm nút có `<legend>Tốc độ nghe</legend>`; mức đang chọn mang `aria-pressed="true"`. |
| `HiddenAudioButton` | Thêm prop `rate?: number` (mặc định `1`). Đổi `rate` **phát lại** bằng cùng khối audio; **CẤM** gọi lại route audio. |
| Trang `/learner/vocabulary` | Hai `<section>` với `aria-labelledby` là `weak-words-heading` và `random-review-heading` — E2E bám vào hai mốc này. |
| Nút "Xem nghĩa" | Mang `aria-expanded`; mở ra thì đổi nhãn thành nghĩa. **CẤM** gọi API khi mở. |
