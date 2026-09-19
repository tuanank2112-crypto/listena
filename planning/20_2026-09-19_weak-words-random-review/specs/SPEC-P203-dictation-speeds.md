# SPEC-P203 — Ba tốc độ nghe tại vòng "Nghe & viết"

File: `src/features/voice/hidden-audio-button.tsx`, `src/app/learner/games/games-client.tsx`.

## 1. Vấn đề

Tốc độ đọc trước đây chỉ chỉnh được ở cài đặt giọng — cách vòng chính tả hai màn hình, và đổi thì đổi cho **mọi** mặt. Học viên không nghe kịp một từ không có cách nghe chậm **ngay tại đó**, cho riêng lượt đó.

## 2. Hợp đồng

```ts
const SPELL_SPEEDS = [
  { rate: 0.75, label: "Nghe chậm" },
  { rate: 1,    label: "Bình thường" },
  { rate: 1.2,  label: "Nghe nhanh" },
] as const;
```

`HiddenAudioButton` nhận `rate?: number` (mặc định `1`) và đặt `audio.playbackRate = rate`. Khi `rate` đổi **sau lúc gắn**, nó **phát lại** — chọn tốc độ chính là yêu cầu nghe theo tốc độ đó; bắt học viên bấm thêm một nút nữa là thừa.

`spellRate` sống ở `GamesClient` cho **cả lượt chơi**: ai cần chậm ở từ này thường cần chậm ở từ sau.

## 3. Vì sao dùng `playbackRate` chứ không xin máy chủ đọc chậm

| Cách | Kết luận |
|---|---|
| `audio.playbackRate` | **Chọn.** Không request mới, không tốn ký tự ElevenLabs, dùng lại đúng khối audio đã tải. Trình duyệt giữ cao độ nên 0.75x vẫn là giọng người. |
| Gọi lại route audio kèm tham số tốc độ | **Loại.** Mỗi lần đổi tốc độ là một lượt tổng hợp nữa (tiền và độ trễ), và thêm một tham số vào route đang phục vụ **đáp án ẩn** — càng ít bề mặt càng tốt. |

## 4. Vùng cấm

- **CẤM** để tốc độ đi vào chấm điểm. Nghe chậm không làm câu trả lời đúng hơn hay kém hơn; máy chủ không biết và không cần biết.
- **CẤM** ghi lựa chọn tốc độ lên máy chủ hoặc vào mastery.
- **CẤM** vượt ra ngoài ba mức. Trình duyệt nhận `playbackRate` bất kỳ, nhưng dưới khoảng 0.7 giọng vỡ tiếng và trên khoảng 1.3 học viên A1-A2 không theo kịp — đúng khoảng app tham khảo đã chọn.
- **CẤM** đổi `fieldset` mà bỏ `min-w-0`: Plan18 đã mất một lần vì `fieldset` mặc định `min-inline-size: min-content` làm tràn ngang ở 360px.
