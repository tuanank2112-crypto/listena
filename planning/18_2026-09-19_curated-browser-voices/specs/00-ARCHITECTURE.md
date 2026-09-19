# 00 — Kiến trúc & bất biến

## Mục tiêu

Học viên nghe được **giọng Anh dễ nghe, phát âm chuẩn** mà **không cần bất kỳ API key nào**, kể cả trên production Vercel; và được **tự chọn giọng** trong Settings thay vì phải chấp nhận giọng máy tự gán.

## Non-goals (KHÔNG làm trong plan này)

- Không thêm engine mới (không Piper/Kokoro/sidecar), không tải model, không key, không endpoint, không đụng DB.
- Không đổi giọng tiếng Việt, không đổi đường ElevenLabs (có key thì giọng AI vẫn dẫn đầu).
- Không đo/ghi chất lượng nghe vào hồ sơ học tập.

## Bất biến kiến trúc

| # | Bất biến | Vì sao |
|---|---|---|
| A1 | Thứ tự xếp hạng gốc Plan14 giữ nguyên: **accent đúng > tier (NEURAL>PREMIUM>SYSTEM>REMOTE) > default > local**. Điểm catalog chỉ phân thứ hạng **bên trong** một tier. | Không để một mục catalog lật ngược quyết định kiến trúc cũ (vd Google REMOTE leo lên đầu trên Android). |
| A2 | Giọng novelty vẫn bị loại tuyệt đối (`isExcludedVoice`). | Không bao giờ làm mẫu phát âm. |
| A3 | Catalog khớp theo **tên đã chuẩn hoá**, không theo `voiceURI`. | Cùng một giọng có `voiceURI` khác nhau giữa Chrome/Edge/Safari/Firefox và giữa các bản OS. |
| A4 | Thiết bị không có giọng nào trong catalog vẫn phải phát được: catalog **chỉ cộng điểm**, không lọc. | Không để app câm trên máy lạ. |
| A5 | Lựa chọn giọng của học viên chỉ nằm ở `localStorage`, không gửi server. | Vùng cấm Plan14/15: nghe không sinh bằng chứng học tập. |
| A6 | Nghe thử trong Settings đi thẳng engine trình duyệt, không qua chuỗi engine AI. | Nếu không thì khi có key ElevenLabs, bấm nghe thử giọng trình duyệt lại phát ra giọng ElevenLabs. |
| A7 | Không thêm dependency; toàn bộ nằm trong `src/core/voice`, `src/core/tts`, `src/features/voice`, `src/components/providers.tsx`. | Đợt này là MINOR client-side thuần. |

## Router thứ tự đọc

1. File này.
2. [01-CONTRACTS.md](01-CONTRACTS.md) — chữ ký và kiểu.
3. [SPEC-P180-CATALOG.md](SPEC-P180-CATALOG.md) → [SPEC-P181-PICKER.md](SPEC-P181-PICKER.md) → [SPEC-P182-SKILL.md](SPEC-P182-SKILL.md).
4. [OPERATIONS.md](OPERATIONS.md), [TESTING-ACCEPTANCE.md](TESTING-ACCEPTANCE.md).
5. Nền cũ: `docs/adr/0002-voice-ai.md` (chính sách giọng), `docs/adr/0003-elevenlabs-voice.md` (đường có key), `planning/14_.../specs/SPEC-P140-*`.

## Sơ đồ đường tiếng (sau plan này)

```
speakCurated/speakLines
  └─ en → ElevenLabsSpeechEngine (chỉ khi server có key & engine=auto)
           └─ fail/không key → WebSpeechEngine
                                 ├─ 1. options.voice khớp đúng tên/URI
                                 ├─ 2. browserVoices[accent] của học viên   ← MỚI (P181)
                                 └─ 3. chooseEnglishVoice(catalog + tier)    ← nâng cấp (P180)
  └─ vi → Composite[ElevenLabs → VieNeu] → WebSpeech            (không đổi)

speakWithBrowserVoice  ← MỚI, chỉ dùng cho nút "nghe thử" trong Settings
  └─ engine fallback tương ứng ngôn ngữ, ép đúng voiceURI
```
