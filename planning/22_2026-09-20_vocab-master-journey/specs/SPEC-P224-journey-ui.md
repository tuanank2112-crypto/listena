# SPEC-P224 — Dải hành trình và màn học từ

File: `src/features/lesson-journey/lesson-journey-band.tsx`, `lesson-word-cards.tsx`, gắn vào `lesson-client.tsx`.

## 1. Dải hành trình

Đặt **ngay dưới** thẻ "Học cùng AI" và **ngay trên** phần bài tập: học viên thấy đường đi trước khi thấy câu hỏi đầu tiên.

- Thanh phần trăm kèm con số.
- Năm dòng, mỗi dòng: số thứ tự (đổi thành dấu tick khi xong), nhãn, gợi ý một dòng, nút hành động.
- **Bước kế tiếp** viền xanh và nút đặc; các bước khác nút viền, nhãn "Mở".
- Đi hết thì thêm một dòng chúc mừng, **không** khoá gì lại.

**BẮT BUỘC** mọi bước vẫn bấm được sau khi đã xong — học viên luôn được ôn lại.

**BẮT BUỘC** hỏng khi tải thì **trả `null`**, không hộp lỗi. Trang bài học vẫn học được trọn vẹn khi thiếu dải này; một hộp lỗi ở đây chỉ làm người đang học lo về thứ không phải việc của họ.

## 2. Điều hướng từng bước

| Bước | Đi đâu |
|---|---|
| LEARN | mở màn học từ ngay trong trang |
| PRACTICE, TEST | cuộn xuống phần bài tập (`exercisesRef`) |
| PLAY, LISTEN | `/learner/games` kèm `lesson` và `mode` |

Bài không có từ nào thì bước LEARN hiện "Bài chưa có từ" thay vì một nút không làm gì.

## 3. Màn học từ

Lật từng thẻ: từ, IPA, nút nghe, nghĩa tiếng Việt, câu ví dụ, kèm thanh tiến độ.

**BẮT BUỘC** chỉ nút ở **thẻ cuối cùng** ("Đã đọc hết") mới ghi bước LEARN. Mở ra rồi đóng ngay **CẤM** tính là đã học — đây là bước duy nhất không có bằng chứng thật đứng sau, nên nó phải tốn đúng công sức mà nó tuyên bố.

Nút lùi ở thẻ đầu tiên là "Đóng": thoát mà không ghi gì.

Ghi hỏng (mất mạng) thì **không** đánh dấu xong. Thà để bước chưa tick còn hơn tuyên bố một tiến độ chưa được lưu.

## 4. Vùng cấm

- **CẤM** in tên enum (`LEARN`, `PLAY`…) ra màn hình. Chỉ nhãn tiếng Việt.
- **CẤM** lưu trạng thái thẻ đang xem vào `localStorage`. Nó sống trong một lần xem.
- **CẤM** thêm chấm điểm vào màn học từ. Đây là bước đọc, không phải bài tập.
