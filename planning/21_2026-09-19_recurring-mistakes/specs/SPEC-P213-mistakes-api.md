# SPEC-P213 — Đường đọc lịch sử lỗi

File: `src/server/learning/mistakes.ts`, `src/app/api/learner/mistakes/route.ts`.

## 1. Hai nguồn, hai vai

| Nguồn | Cho cái gì | Vì sao không dùng nguồn kia |
|---|---|---|
| `LearnerMemory.recurringErrors` | **Số đếm** | Đây là nguồn planner đọc. Dùng nguồn khác thì trang và gợi ý bước tiếp theo kể hai câu chuyện khác nhau về cùng một học viên. |
| `LearningTurn.contentJson` (lượt `AI`) | **Ví dụ**: câu học viên viết sai + lời Coach giải thích | Memory chỉ giữ số đếm, không giữ câu chữ. |

**BẮT BUỘC:** một họ lỗi có **ví dụ nhưng không có số đếm** vẫn hiện, với `count` bằng số ví dụ. Memory chỉ giữ một cửa sổ các họ gần đây (`MAX_ERRORS`); một lỗi đang hiện ngay trên màn hình là có thật, dù nó đã rơi khỏi cửa sổ đó.

## 2. Đọc `contentJson` phòng thủ

`contentJson` là chuỗi JSON tự do. `parseDetectedError` trả `null` khi: JSON hỏng, giá trị không phải object, `detectedError` không phải object, `type` không phải chuỗi, hoặc `explanationVi` không phải chuỗi.

`actual` **được phép rỗng** (một số lỗi không gắn với đoạn cụ thể nào) — khi đó giao diện hiện `"(câu của bạn)"`.

**BẮT BUỘC:** một lượt hỏng chỉ mất lượt đó. **CẤM** để nó ném lỗi làm hỏng cả trang Tiến bộ.

## 3. Giới hạn đọc

| Hằng | Giá trị | Vì sao |
|---|---|---|
| `AI_TURN_QUERY_LIMIT` | 120 | Đủ nhiều lượt để 6 họ lỗi đều có ví dụ, đủ ít để một truy vấn không quét cả lịch sử |
| `MAX_FAMILIES` | 6 | Quá 6 thì không còn là "lỗi hay lặp" nữa mà là một bảng kê |
| `MAX_EXAMPLES_PER_FAMILY` | 3 | Ba câu đủ để thấy quy luật; nhiều hơn chỉ là cuộn |

Cả ba nằm trong route, **CẤM** nhận từ client.

## 4. Sắp xếp

Lặp nhiều nhất trước; hoà thì họ **có ví dụ** đứng trên họ không có, vì học viên chỉ hành động được trên thứ họ nhìn thấy; hoà tiếp thì theo `key` để hai lần đọc luôn cho cùng thứ tự.

## 5. Vùng cấm

- **CẤM** ghi bất cứ thứ gì. Mở trang này không phải một lần trả lời.
- **CẤM** trả `expected` (câu đúng) trong ví dụ. Hiện tại `toPublicTutorContent` đã không đưa nó ra ngoài; giữ nguyên biên đó.
- **CẤM** để client lọc hay sắp xếp lại.
