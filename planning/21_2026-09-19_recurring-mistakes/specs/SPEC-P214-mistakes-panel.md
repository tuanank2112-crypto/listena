# SPEC-P214 — Khu "Lỗi hay lặp"

File: `src/components/learner-mistakes.tsx`, gắn vào `src/app/learner/progress/page.tsx`.

## 1. Vì sao đặt ở trang Tiến bộ, không phải nơi khác

- **Không phải "Từ yếu"** (`/learner/vocabulary`): trang đó nói về **từ**, khu này nói về **cách nói**. Trộn hai thứ vào một trang làm nhãn điều hướng "Từ yếu" nói dối về nội dung.
- **Không phải một mục điều hướng mới**: điều hướng học viên đã 9 mục sau Plan20. Mục thứ 10 cho một khu chỉ dài vài dòng là cái giá quá đắt.
- **Trang Tiến bộ** đang có thanh kỹ năng và dòng thời gian hoạt động, nhưng **không có gì** nói vì sao một kỹ năng thấp. Khu này nằm **ngay dưới** phần Kỹ năng và **ngay trên** phần Gần đây: nó giải thích các thanh phía trên và dẫn vào hoạt động phía dưới.

## 2. Hành vi

| Trạng thái | Hiển thị |
|---|---|
| Đang tải | Một khối xám nhấp nháy, `aria-hidden` |
| Tải lỗi | **Không hiện gì** |
| Không có lỗi nào | **Không hiện gì** |
| Có lỗi | Danh sách họ lỗi; họ đầu tiên **mở sẵn** |

**BẮT BUỘC:** hỏng hoặc rỗng thì biến mất hoàn toàn. Trang Tiến bộ vẫn trọn vẹn khi thiếu khu này, nên một hộp báo lỗi ở đây chỉ làm học viên lo về thứ không phải việc của họ. Đây là lựa chọn có cân nhắc, không phải quên xử lý lỗi.

Mỗi hàng: số lần lặp trong ô tròn đỏ nhạt, `labelVi` đậm, `hintVi` mờ bên dưới, mũi tên xoay. Mở ra: tối đa 3 ví dụ, mỗi ví dụ gồm **câu học viên đã viết** (màu cảnh báo, có dấu trích dẫn), **lời Coach giải thích** bên dưới, và tên phiên học nơi nó xảy ra.

Một họ có số đếm nhưng không còn ví dụ (đã rơi khỏi cửa sổ 120 lượt) nói thẳng điều đó thay vì mở ra một khoảng trống.

## 3. Vùng cấm

- **CẤM** mọi nút nghe. **Vùng cấm Plan14**: không bao giờ đọc to câu sai của học viên — và cả khu này làm bằng câu sai của họ. Người sau đừng "bổ sung cho nhất quán với các màn hình khác".
- **CẤM** in `key` hay kiểu lỗi thô của model. Chỉ `labelVi` và `hintVi`.
- **CẤM** thêm nút "luyện lỗi này". Planner đã tự đưa học viên tới bài luyện khi lỗi đủ lặp (`RECURRING_ERROR`); một nút ở đây sẽ tạo đường thứ hai, cạnh tranh với quyết định của máy chủ và tiêu một lượt AI ngoài kế hoạch.
- **CẤM** lưu trạng thái mở/đóng vào `localStorage`. Nó chỉ sống trong một lần xem.

## 4. Chi tiết dễ hỏng, đã xử lý

- Câu của học viên có thể dài và không có dấu cách hợp lý ⇒ dùng `break-words`, không `truncate`: cắt cụt một câu sai làm mất đúng phần cần nhìn.
- Hàng tiêu đề dùng `min-w-0` + `truncate` cho nhãn, để nhãn dài không đẩy tràn ngang ở bề rộng 360px — đúng lỗi F-01 Plan18 đã gặp.
