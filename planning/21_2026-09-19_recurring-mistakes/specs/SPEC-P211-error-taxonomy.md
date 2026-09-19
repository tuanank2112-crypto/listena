# SPEC-P211 — Lõi phân loại lỗi

File: `src/core/learning/error-taxonomy.ts` (+ test cùng tên).

## 1. Bảng họ lỗi

18 họ, chọn theo những lỗi người Việt A1-A2 gặp nhiều nhất, mỗi họ có `key`, `labelVi`, `hintVi` và danh sách từ khoá:

`agreement` · `tense` · `verb-form` · `article` · `plural` · `preposition` · `pronoun` · `question-form` · `negation` · `comparative` · `word-order` · `word-choice` · `missing-word` · `extra-word` · `spelling` · `pronunciation` · `punctuation` · `politeness`

**Thứ tự trong bảng là cố ý.** Họ nào đứng trước thì thắng. `agreement` đứng **trước** `tense` và `verb-form` vì chuỗi `"subject verb agreement"` chứa cả `"verb"`; nếu đảo thứ tự, lỗi hoà hợp chủ ngữ – động từ sẽ bị đọc thành lỗi dạng động từ và học viên bị nhắc sai chuyện.

**BẮT BUỘC:** thêm họ mới thì chèn đúng chỗ theo độ cụ thể, không nối vào cuối cho tiện.

## 2. Phép khớp

```ts
function matches(text: string, keyword: string): boolean
```

- Chuẩn hoá trước: hạ chữ thường, mọi ký tự không phải chữ/số thành dấu cách, gom dấu cách. Nhờ vậy `verb_tense`, `Verb Tense`, `VERB-TENSE` về cùng một dạng.
- Từ khoá **nhiều chữ** phải khớp **nguyên cụm** (`" subject verb "`).
- Từ khoá **một chữ** khớp khi: token trùng hệt, **hoặc** token bỏ `s` cuối trùng hệt (`tenses` → `tense`), **hoặc** — chỉ với gốc từ **dài từ 6 ký tự** — token bắt đầu bằng nó (`phonological` → `phonolog`, `capitalisation` → `capitali`).

**Vì sao có ngưỡng 6:** cho phép khớp tiền tố tự do thì `intense` biến thành lỗi thì và `extraction` biến thành lỗi thừa từ. Ngưỡng 6 chặn đúng hai ca đó, và cả hai **đã được ghim bằng test**.

**CẤM** dùng `String.includes` trần trên cả chuỗi. Đã thử và loại: nó để `order` khớp vào `disorder`.

## 3. Lỗi không nhận ra: giữ riêng, không gộp

Kiểu lỗi lạ trở thành **slug của chính nó** (`"idiom misuse"` → `idiom-misuse`), không phải một thùng chung `"other"`.

**Lý do, ghi để người sau đừng "tối ưu":** gộp hai lỗi lạ khác nhau sẽ **cộng dồn** số đếm của chúng và có thể đẩy tổng qua ngưỡng 3 của planner. Học viên bị gửi đi luyện một lỗi họ **chưa từng lặp lại**. Đếm chẻ làm mất một lần nhắc; đếm bịa dạy sai. Mất một lần nhắc là cái giá rẻ hơn.

Nhãn hiển thị của chúng là `"Lỗi khác"` — vẫn là tiếng Việt. Kiểu thô **không** rò ra giao diện (bất biến BB4); nó chỉ nằm trong `rawTypes` để chẩn đoán.

## 4. `aggregateRecurringErrors`

Gộp theo khoá chuẩn, **cộng** số đếm, bỏ mục không có `lastEvidenceId`.

`lastEvidenceId` lấy từ **thành viên có count lớn nhất**, hoà thì theo `errorType`. **CẤM** lấy theo vị trí trong mảng: `updateErrors` ghi đè mục cũ **tại chỗ** và chỉ nối thêm mục mới, nên thứ tự mảng **không phải** thứ tự thời gian. `LearnerMemory` không lưu mốc thời gian nào để làm tốt hơn.

Sắp xếp: count giảm dần, rồi `key` tăng dần. **BẮT BUỘC** có khoá phụ, nếu không hai lần đọc trên cùng dữ liệu cho hai thứ tự khác nhau.

## 5. Vùng cấm

- **CẤM** ràng buộc `detectedError.type` thành enum trong `learning-session.ts`. Xem non-goals ở `00-ARCHITECTURE.md`.
- **CẤM** dịch `labelVi` sang tiếng Anh hay thêm thuật ngữ Anh vào trong ngoặc. Học viên A1-A2 không đọc được nó, và đó chính là lỗi đang được sửa.
- **CẤM** để hàm ở đây đọc DB. Planner gọi chúng trong đường quyết định nóng.
