# SPEC-P201 — Lõi phân loại và chọn từ

File: `src/server/learning/weak-words.ts` (+ `weak-words.test.ts`).

## 1. Phân loại (`classifyStanding`)

| Trạng thái | Điều kiện | Lý do chọn ngưỡng này |
|---|---|---|
| `weak` | `incorrectCount > 0` | Lấy nguyên quy tắc của app tham khảo. Sai một lần là đủ để từ đó đáng nhìn lại, kể cả khi đã đúng chín lần. |
| `learned` | `incorrectCount === 0 && correctCount >= 2` | Cũng của app tham khảo: đúng hai lần và chưa từng sai. |
| `shaky` | còn lại | Đã gặp nhưng chưa chứng minh được gì. |

**BẮT BUỘC:** `weak` được kiểm **trước** `learned`. Một từ đúng 9 sai 1 là `weak`, không phải `learned`.

## 2. Xếp hạng từ hay sai (`rankWeakWords`)

Lọc `incorrectCount > 0`, rồi sắp theo đúng thứ tự khoá này:

1. `incorrectCount` **giảm dần** — sai bốn lần cần chú ý trước sai một lần.
2. Độ chính xác `correctCount / (correctCount + incorrectCount)` **tăng dần**.
3. `masteryScore` tăng dần.
4. `displayText.localeCompare` — khoá cuối cùng, để hai lần gọi trên cùng dữ liệu luôn cho cùng thứ tự.

**BẮT BUỘC:** phải có khoá thứ 4. Thiếu nó thì thứ tự phụ thuộc thứ tự trả về của DB và danh sách nhảy giữa hai lần tải — đúng loại lỗi Plan18 đã gặp ở xếp hạng giọng.

**CẤM:** đưa `dueNow` hay lịch SM-2 vào khoá sắp xếp. Đây là bảng "hay sai", không phải hàng đợi ôn tập; hàng đợi ôn tập là màn Ôn từ.

## 3. Nhóm ôn ngẫu nhiên (`selectRandomReview`)

Mỗi hàng bốc `random() * (0.5 + masteryScore)`; lấy `count` giá trị nhỏ nhất.

- Hằng `0.5` là sàn: từ có `masteryScore = 0` vẫn bốc trong khoảng `[0, 0.5)` chứ không phải luôn bằng 0, nên thứ tự không bị cố định.
- Từ nắm chắc (`masteryScore` cao) nhân với hệ số lớn hơn nên **thường** thua, nhưng vẫn có thể thắng khi bốc thấp.

**BẮT BUỘC:** một từ nắm chắc phải **có khả năng** lọt vào nhóm. Đã ghim bằng test. Nếu lọc cứng theo mastery thì nhóm "ngẫu nhiên" chỉ là danh sách "hay sai" dưới một cái tên khác, và học viên mất cơ hội xác nhận thứ mình tưởng đã thuộc.

**BẮT BUỘC:** `random` là tham số. Caller thật truyền `Math.random`; test truyền hàm cố định.

**CẤM:** nhận seed từ client.

## 4. `dueNow`

`nextReviewAt !== null && nextReviewAt <= now`. `null` nghĩa là `false` (chưa có lịch thì chưa đến hạn). Đây là **nhãn hiển thị**, không phải đầu vào xếp hạng.
