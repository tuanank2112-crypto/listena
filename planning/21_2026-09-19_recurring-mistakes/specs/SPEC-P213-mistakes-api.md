# SPEC-P213 — Đường đọc lịch sử lỗi

File: `src/server/learning/mistakes.ts`, `src/app/api/learner/mistakes/route.ts`.

## 1. Hai nguồn, hai vai

| Nguồn | Cho cái gì | Vì sao không dùng nguồn kia |
|---|---|---|
| `LearnerMemory.recurringErrors` | **Số đếm** | Đây là nguồn planner đọc. Dùng nguồn khác thì trang và gợi ý bước tiếp theo kể hai câu chuyện khác nhau về cùng một học viên. |
| `LearningTurn.contentJson` (lượt `AI`) | **Ví dụ**: câu học viên viết sai + lời Coach giải thích | Memory chỉ giữ số đếm, không giữ câu chữ. |

**BẮT BUỘC:** một họ lỗi có **ví dụ nhưng không có số đếm** vẫn hiện, với `count` bằng số ví dụ. Memory chỉ giữ một cửa sổ các họ gần đây (`MAX_ERRORS`); một lỗi đang hiện ngay trên màn hình là có thật, dù nó đã rơi khỏi cửa sổ đó.

## 1b. Trích dẫn cái gì — sửa sau khi demo thật (2026-09-20 02:40)

`detectedError.actual` là chuỗi tự do, model muốn viết gì thì viết. Chạy thật trên production cho ra **ba dạng khác nhau**:

| Model trả về | Thực tế là gì |
|---|---|
| `"lose"` | Đúng một đoạn học viên đã viết |
| `"have lost / two bag"` | Hai đoạn dồn vào một chuỗi, **chỉ một** có trong câu |
| `"present tense with incorrect verb form"` | **Văn mô tả**, học viên chưa từng viết chữ nào như vậy |

Trích dẫn thẳng `actual` nghĩa là có lúc đưa cho học viên những chữ **họ không hề viết**. Đó là nói dối về chính bài làm của họ.

**BẮT BUỘC:** phần trích dẫn là **tin nhắn của học viên**, lấy từ lượt `LEARNER` mà lời sửa đang trả lời. `actual` chỉ dùng để **chỉ vào bên trong** câu đó.

- `findHighlights(learnerText, actual)` tách `actual` theo `/ ; , -> →`, giữ **chỉ** những mảnh **thật sự có mặt** trong `learnerText` (không phân biệt hoa thường), bỏ mảnh dưới 2 ký tự.
- Không mảnh nào trùng ⇒ `highlights: []` ⇒ giao diện hiện nguyên câu, **không tô gì**. Văn mô tả tự động rơi vào nhánh này.
- **CẤM** hiển thị `actual` ở bất kỳ đâu. Nó là con trỏ, không phải nội dung.

**Ghép lượt:** gom theo `sessionId`, duyệt theo `sequence` tăng dần, nhớ tin nhắn `LEARNER` gần nhất. Vì vậy một lời sửa **không bao giờ** mượn câu của phiên khác. Không tìm được lượt học viên ⇒ `learnerText: ""` và giao diện chỉ hiện lời giải thích — thà thiếu trích dẫn còn hơn bịa một câu.

Hệ quả: truy vấn đọc **cả hai** actor, nên `TURN_QUERY_LIMIT` là **240** (khoảng 120 lượt trao đổi).

## 2. Đọc `contentJson` phòng thủ

`contentJson` là chuỗi JSON tự do. `parseDetectedError` trả `null` khi: JSON hỏng, giá trị không phải object, `detectedError` không phải object, `type` không phải chuỗi, hoặc `explanationVi` không phải chuỗi.

`actual` **được phép rỗng** — khi đó không tô gì, câu của học viên vẫn hiện nguyên vẹn.

**BẮT BUỘC:** một lượt hỏng chỉ mất lượt đó. **CẤM** để nó ném lỗi làm hỏng cả trang Tiến bộ.

## 3. Giới hạn đọc

| Hằng | Giá trị | Vì sao |
|---|---|---|
| `TURN_QUERY_LIMIT` | 240 | Đủ nhiều lượt để 6 họ lỗi đều có ví dụ, đủ ít để một truy vấn không quét cả lịch sử. Gấp đôi vì nay đọc cả lượt học viên |
| `MAX_FAMILIES` | 6 | Quá 6 thì không còn là "lỗi hay lặp" nữa mà là một bảng kê |
| `MAX_EXAMPLES_PER_FAMILY` | 3 | Ba câu đủ để thấy quy luật; nhiều hơn chỉ là cuộn |

Cả ba nằm trong route, **CẤM** nhận từ client.

## 4. Sắp xếp

Lặp nhiều nhất trước; hoà thì họ **có ví dụ** đứng trên họ không có, vì học viên chỉ hành động được trên thứ họ nhìn thấy; hoà tiếp thì theo `key` để hai lần đọc luôn cho cùng thứ tự.

## 5. Vùng cấm

- **CẤM** ghi bất cứ thứ gì. Mở trang này không phải một lần trả lời.
- **CẤM** trả `expected` (câu đúng) trong ví dụ. Hiện tại `toPublicTutorContent` đã không đưa nó ra ngoài; giữ nguyên biên đó.
- **CẤM** để client lọc hay sắp xếp lại.
