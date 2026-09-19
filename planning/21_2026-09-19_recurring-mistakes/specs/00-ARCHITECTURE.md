# 00 — Kiến trúc và bất biến

## Thứ tự đọc

1. File này — vấn đề, mục tiêu, non-goals, bất biến.
2. [`01-CONTRACTS.md`](01-CONTRACTS.md) — chữ ký hàm, endpoint, bảng lỗi.
3. [`SPEC-P211-error-taxonomy.md`](SPEC-P211-error-taxonomy.md) — lõi phân loại lỗi.
4. [`SPEC-P212-planner-counting.md`](SPEC-P212-planner-counting.md) — sửa lỗi đếm của planner.
5. [`SPEC-P213-mistakes-api.md`](SPEC-P213-mistakes-api.md) — đường đọc lịch sử lỗi.
6. [`SPEC-P214-mistakes-panel.md`](SPEC-P214-mistakes-panel.md) — khu "Lỗi hay lặp".
7. [`OPERATIONS.md`](OPERATIONS.md) và [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md).

## Vấn đề (tìm bằng cách đọc mã, không phải suy đoán)

### Lỗi A — số đếm bị chẻ, học viên không được nhắc (đúng nghĩa là lỗi sai)

`TutorTurnOutputSchema.detectedError.type` là `z.string().max(80)` — **hoàn toàn tự do**. Model viết gì cũng được. Trên production ngày 2026-09-19 nó trả về `"tense"`; ở lượt khác cùng một lỗi có thể thành `"verb_tense"`, `"Verb Tense"` hay `"past simple"`.

`updateErrors` trong `src/server/learner-memory/repository.ts` gộp bằng **so sánh chuỗi chính xác**:

```ts
const existing = errors.find((item) => item.errorType === evidence.errorType);
```

Còn planner lọc `count >= 3`. Hậu quả: một học viên sai **cùng một lỗi** bốn lần, model gọi hai tên khác nhau ⇒ hai mục count 2 ⇒ **không mục nào chạm ngưỡng** ⇒ planner **không bao giờ** đưa họ đi luyện lại lỗi đó. Đây là im lặng sai, loại lỗi tệ nhất: không có gì đổ vỡ, chỉ là việc dạy không xảy ra.

### Lỗi B — tiếng Anh chuyên ngành rơi vào giữa câu tiếng Việt

`planner.ts` và `next-action.ts` mỗi file giữ **một bản sao** của:

```ts
function formatErrorType(errorType: string) {
  return errorType.replaceAll("_", " ").toLowerCase();
}
```

rồi ghép vào `Bạn đã lặp lại lỗi ${...} ${count} lần gần đây`. Với dữ liệu thật từ production, học viên đọc được: **"Bạn đã lặp lại lỗi tense 4 lần gần đây."** Đối tượng của sản phẩm là người Việt trình độ A1-A2 — theo định nghĩa họ **không** biết thuật ngữ ngữ pháp tiếng Anh. Hai bản sao còn có thể trôi lệch nhau.

### Khoảng trống C — lời sửa của Coach chỉ sống một màn hình

Mỗi lượt AI đã mang sẵn `detectedError.actual` (đoạn học viên viết sai) và `explanationVi` (lời Coach giải thích). Sau lượt đó, **chỉ planner** còn nhìn tới, và chỉ nhìn số đếm. Học viên không có chỗ nào xem lại mình hay sai gì. Plan20 vừa cho họ thấy **từ** hay sai; phần **cách nói sai** vẫn trống.

## Mục tiêu

1. Một tên chuẩn cho mỗi họ lỗi ⇒ đếm đúng ⇒ planner nhắc đúng lúc.
2. Một nhãn tiếng Việt cho mỗi họ lỗi ⇒ học viên đọc được.
3. Khu **"Lỗi hay lặp"** trên trang Tiến bộ: lỗi hay lặp nhất, kèm **chính câu học viên đã viết** và lời Coach đã giải thích.

## Non-goals (đã cân nhắc và quyết định KHÔNG làm)

| Không làm | Lý do |
|---|---|
| Ràng buộc `detectedError.type` thành enum trong schema | Model sẽ bị ép vào một tập cứng và mất sắc thái; tệ hơn, một lỗi ngoài tập sẽ bị đẩy về `UNKNOWN` và **mất** thông tin. Chuẩn hoá ở tầng đếm giữ được cả hai: model tự do mô tả, hệ thống vẫn đếm đúng. |
| Dịch lại dữ liệu cũ trong `LearnerMemory` bằng migration | Không cần: chuẩn hoá **cả lúc đọc** nên mục cũ gộp đúng ngay. Không đổi schema, không rủi ro dữ liệu. |
| Gộp mọi lỗi lạ vào một nhóm "khác" | Sẽ **bịa ra** một sự lặp lại không có thật và đẩy học viên đi luyện thứ họ không hề sai. Xem SPEC-P211 §3. |
| Nút nghe trong khu "Lỗi hay lặp" | **Vùng cấm Plan14**: không bao giờ đọc to câu sai của học viên. Cả khu này làm bằng câu sai của họ. |
| Sinh bài tập bằng AI từ danh sách lỗi | Planner đã làm việc đó (`RECURRING_ERROR` → Practice Mission). Khu này là **tấm gương**, không phải một bộ sinh bài thứ hai. |
| Đổi `AttemptError` / `ErrorType` enum trong Prisma | Ngoài phạm vi; taxonomy **có** ánh xạ các giá trị enum đó để hai nguồn nói cùng một ngôn ngữ. |

## Bất biến

- **BB1 — Không đổi schema.** Không migration, không cột mới.
- **BB2 — Chuẩn hoá ở cả hai đầu.** Ghi: `service.ts` canonical hoá trước khi cộng dồn. Đọc: planner, next-action và API đều gộp lại lần nữa (thao tác **lũy đẳng**), nên dữ liệu ghi trước hôm nay vẫn gộp đúng.
- **BB3 — Một nguồn số đếm.** Trang "Lỗi hay lặp" và planner đọc **cùng** `LearnerMemory.recurringErrors`. Trang không được tự đếm từ số ví dụ đang hiển thị, nếu không nó và gợi ý bước tiếp theo sẽ kể hai câu chuyện khác nhau về cùng một người.
- **BB4 — Không chữ Anh trong câu tiếng Việt.** Mọi chuỗi học viên đọc đều dùng `labelVi`. Kiểu lỗi thô của model **không bao giờ** hiển thị.
- **BB5 — Phạm vi chủ sở hữu.** Chỉ đọc lượt thuộc phiên của chính học viên.
- **BB6 — Chỉ đọc.** Plan21 không thêm đường ghi nào.
- **BB7 — Im lặng.** Không voice, theo vùng cấm Plan14.
