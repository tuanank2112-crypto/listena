# SPEC-P231 — Giải nghĩa khi được hỏi

File: `src/core/voice/voice-script.ts`, `src/app/learner/session/[sessionId]/session-player.tsx`.

## 1. Điều đang sai

`buildTurnVoiceScript` kết thúc bằng:

```ts
const coach = prepareSpokenText(coachMessage, "vi");
for (const line of coach.lines) lines.push({ role: "COACH", lang: line.lang, ... });
```

Nên **mỗi lượt AI** đọc xong câu tiếng Anh rồi đọc tiếp lời giải thích tiếng Việt. Học viên hiểu lượt đó rồi vẫn bị kéo ra khỏi tiếng Anh. Và trên màn hình, khối "AI Coach" màu vàng luôn mở sẵn dưới mọi lượt.

## 2. Thay đổi

**Giọng:** bỏ hẳn khối đẩy dòng `COACH`. `voiceScript` giờ chỉ còn `NPC` (tiếng Anh) và `RECAST` (câu đã sửa, đọc chậm, tiếng Anh).

**Giữ `RECAST` có chủ đích:** nó là **mẫu để bắt chước**, không phải lời giảng. Bỏ nó đi là mất phần dạy phát âm câu đúng.

**Màn hình:** khối Coach lui về sau nút `Giải nghĩa` (đóng mặc định). Mở ra mới thấy chữ, và bên trong có một nút loa để nghe — bấm mới đọc.

`coachMessage` vẫn được đọc ở đầu `buildTurnVoiceScript`, vì một lượt **chỉ có** coach message mà không có `npcReply` thì vẫn là lượt đáng nói; và nếu thiếu cả hai thì không có gì để nói.

## 3. Vùng cấm

- **CẤM** đưa bất kỳ dòng `lang: "vi"` nào trở lại `voiceScript`. Đã ghim bằng test khẳng định `lines.some(l => l.lang === "vi") === false`.
- **CẤM** mở sẵn phần giải nghĩa, kể cả "chỉ cho lượt có lỗi". Mặc định là im lặng.
- **CẤM** tự đọc phần giải nghĩa khi nó vừa mở ra. Mở là một hành động, nghe là một hành động khác.
- **CẤM** bỏ `coachMessage` khỏi dữ liệu hay khỏi DTO. Nó vẫn có giá trị; chỉ là không tự phát.

## 4. Hệ quả đã xử lý

`e2e/learning-regressions.spec.ts` khẳng định lời Coach hiện ngay sau khi chấm. Test đó **đúng với hành vi cũ**, nên đã cập nhật: khẳng định lời Coach **không** hiện, bấm `Giải nghĩa`, rồi mới khẳng định nó hiện — và lặp lại sau khi tải lại trang.

Hai chi tiết khiến bản sửa đầu tiên của test vẫn đỏ, ghi để khỏi vấp lại:

1. `getByRole("button", { name })` khớp **chuỗi con**, nên `"Giải nghĩa"` cũng khớp `"Ẩn giải nghĩa"`. Phải dùng `exact: true`.
2. `.last()` chạy trước khi lượt AI thứ hai kịp render thì trỏ nhầm lượt. Phải chờ `toHaveCount(2)` rồi mới `.last()`.
