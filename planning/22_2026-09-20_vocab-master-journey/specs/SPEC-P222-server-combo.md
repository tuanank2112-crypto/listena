# SPEC-P222 — Combo và điểm do máy chủ tính

File: `src/core/games/run-progress.ts`, `src/server/adaptive-games/service.ts`, `games-client.tsx`.

## 1. Điều đã có sẵn, và điều đang sai

`AdaptiveGameRound` **đã** lưu `correct` và `score` cho từng lượt, theo `position`. Combo vì thế **suy ra được, không cần cột mới**.

Điều đang sai nằm ở client. Nó tự bịa điểm:

```ts
setScore((value) => value + Math.max(10, Math.round(result.score * 20)));
```

kèm comment "display-only". Nhưng học viên không đọc comment — họ đọc con số. Một điểm số do trình duyệt cộng ra là một điểm số do trình duyệt tự cho.

## 2. Hợp đồng

```ts
summariseRunProgress(rounds) -> { answered, total, correct, streak, bestStreak, totalScore }
```

- Sắp theo `position` rồi mới duyệt: một câu trả lời tới muộn **CẤM** thổi phồng chuỗi combo.
- Lượt `correct === null` (chưa trả lời) **bị bỏ qua**, không tính là sai. Game đang chơi dở chưa làm đứt combo của ai.
- `totalScore` là **tổng điểm của chính máy chủ**, làm tròn thành số nguyên vì học viên đọc nó.
- `comboLabelVi(streak)` trả `null` khi `streak < 2`. Một câu đúng là một câu đúng, chưa phải combo.

## 3. Đọc ở đâu, và vì sao không đọc trong batch

`submitAdaptiveGameAnswer` gọi `loadRunProgress` **sau khi** batch nguyên tử trả về, rồi gắn kết quả vào phản hồi.

**BẮT BUỘC** nằm ngoài batch. Batch là ranh giới bền vững của câu trả lời và đã được kiểm rất kỹ (Plan13 G1); combo chỉ là **cách nhìn** vào thứ batch vừa ghi, không phải một phần của việc ghi. Nhét thêm một truy vấn vào trong đó là đánh đổi rủi ro thật lấy một lần đọc.

Giá phải trả: một truy vấn nhẹ mỗi câu trả lời, phạm vi `{ runId, run: { userId } }`.

## 4. Vùng cấm

- **CẤM** client tự cộng điểm hay tự đếm combo. Nó hiển thị `progress`, không hơn.
- **CẤM** khôi phục công thức `result.score * 20`.
- **CẤM** đưa `progress` vào đường ghi hay vào mastery. Nó là số để nhìn, không phải bằng chứng học.
