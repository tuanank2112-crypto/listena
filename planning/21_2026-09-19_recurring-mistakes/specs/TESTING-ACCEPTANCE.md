# TESTING & ACCEPTANCE

## 1. Ma trận test

| Mã | Điều được ghim | Nơi | Loại |
|---|---|---|---|
| T211-01 | 7 cách viết của cùng một lỗi thì gộp về một khoá (gồm `"tense"` — đúng chuỗi production trả về) | `error-taxonomy.test.ts` | unit |
| T211-02 | `subject verb agreement` không bị đọc thành `verb-form` | như trên | unit |
| T211-03 | 12 họ lỗi phổ biến nhận đúng | như trên | unit |
| T211-04 | 8 giá trị enum `ErrorType` của Prisma ánh xạ vào cùng các họ | như trên | unit |
| T211-05 | **`intense` không thành lỗi thì, `extraction` không thành lỗi thừa từ** | như trên | unit |
| T211-06 | Hai lỗi lạ khác nhau **không** bị gộp | như trên | unit |
| T211-07 | Rỗng / chỉ dấu / null / undefined ⇒ `null` | như trên | unit |
| T211-08 | Nhãn luôn tiếng Việt, kể cả nhãn dự phòng | như trên | unit |
| T211-09 | **2 + 2 = 4** — số đếm bị chẻ cộng lại đúng | như trên | unit |
| T211-10 | `lastEvidenceId` lấy theo count lớn nhất, không theo vị trí mảng | như trên | unit |
| T211-11 | Thứ tự ổn định khi đảo đầu vào | như trên | unit |
| T212-01 | **Planner trả `PRACTICE` cho hai mục count 2** — ca trước đây im lặng bỏ qua | `planner.test.ts` | unit |
| T212-02 | `reasonVi` chứa `"thì của động từ"`, **không** chứa `"tense"` | như trên | unit |
| T213-01 | Ví dụ gộp về một họ dù model gọi hai tên | `mistakes.test.ts` | unit |
| T213-02 | `count` lấy từ memory, không từ số ví dụ | như trên | unit |
| T213-03 | Họ có ví dụ nhưng đã rơi khỏi memory vẫn hiện | như trên | unit |
| T213-04 | Mang đúng lời Coach và tên phiên học | như trên | unit |
| T213-05 | JSON hỏng / `detectedError` sai kiểu / thiếu trường ⇒ bỏ qua lượt, không vỡ | như trên | unit |
| T213-06 | Tôn trọng cả hai giới hạn | như trên | unit |
| T213-07 | Thứ tự ổn định | như trên | unit |
| T213-08 | Ẩn danh ⇒ `401` và **không** chạm DB | `route.test.ts` | unit |
| T213-09 | Chỉ đọc lượt của chính học viên | như trên | unit |
| T213-10 | Học viên chưa có gì ⇒ `200` với danh sách rỗng, không lỗi | như trên | unit |
| T213-11 | Lỗi cấu hình DB không rò thông điệp máy chủ | như trên | unit |
| T214-01 | Route từ chối caller ẩn danh qua HTTP thật | `e2e/mistakes.spec.ts` | E2E |
| T214-02 | Hai cách gọi tên gộp thành một họ, hiện **nhãn tiếng Việt**, và `"verb_tense"` **không** xuất hiện trên màn hình | như trên | E2E |
| T214-03 | Câu học viên đã viết hiện ngay ở họ mở sẵn | như trên | E2E |
| T214-04 | **Câu sai của học viên khác không bao giờ rời máy chủ** | như trên | E2E |

## 2. Bằng chứng nghiệm thu (số thật)

| Gate | Trước Plan21 | Sau Plan21 |
|---|---|---|
| `npm run type-check` | 0 lỗi | **0 lỗi** |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | **0 lỗi / 0 cảnh báo** |
| `npx vitest run` | 131 file / 840 test | **134 file / 868 test** |
| `npm run build` | PASS | **PASS**, có `/api/learner/mistakes` |
| `npx playwright test` | 43/43 | **46/46** |

### Bằng chứng khác biệt thật, không phải "test xanh"

1. **Lỗi đếm chẻ:** `planner.test.ts` → "counts one mistake once, however the model spelled it". Đầu vào là hai mục `count: 2`. Trước thay đổi planner **không** trả `PRACTICE` (2 < 3 ở cả hai mục); sau thay đổi nó trả `PRACTICE` với `reasonCode: RECURRING_ERROR`.
2. **Tiếng Anh trong câu tiếng Việt:** cùng file → `reasonVi` khẳng định chứa `"thì của động từ"` **và** khẳng định **không** chứa `"tense"`. Trước thay đổi câu đó là `"Bạn đã lặp lại lỗi tense 4 lần gần đây."`
3. **Dữ liệu thật từ production:** chuỗi `"tense"` trong T211-01 không phải giả định — đó đúng là `detectedError.type` mà Vyce trả về trên production ngày 2026-09-19, ghi trong hot memory.

## 3. Exit Gates

| Gate | Trạng thái |
|---|---|
| 5 gate local xanh | ✅ local / ⬜ server |
| Không migration, không env mới, không dependency mới | ✅ local / ⬜ server |
| Nghiệm thu production (`/learner/progress` 307 về login, `/api/learner/mistakes` 401 ẩn danh) | ⬜ server |
| Một học viên thật thấy lỗi của mình trên production | ⬜ server — cần tích luỹ đủ lượt có lỗi |
