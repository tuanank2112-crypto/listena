# SPEC-P152 — Engine client, preferences, tích hợp mọi màn hình

## 1. Engines (`providers.tsx`)
- en: primary `ElevenLabsSpeechEngine`, fallback `WebSpeechEngine({getAccent})`.
- vi: primary `CompositeSpeechEngine([ElevenLabs, VieNeu])`, fallback `WebSpeechEngine`.
- `ElevenLabsSpeechEngine`: `isAvailable()` (prefs.engine ≠ browser && capability), POST `/api/voice/tts` với `{text, lang, accent?, voiceId?, speed}`; 429/502/503/504 → `unavailable` (fallback), lỗi khác throw; blob cache 40; phát qua `HTMLAudioElement`; abort → AbortError.
- `CompositeSpeechEngine`: thử tuần tự; `cancelled` dừng; `failed/unavailable` sang engine kế.

## 2. Preferences (localStorage `listena.voice.v1`)
Thêm `engine: "auto"|"browser"` (mặc định auto), `aiVoices: {en-US?, en-GB?, vi?}` (voice_id, regex kiểm). `setPreferredAiVoice(key, id|undefined)`.

## 3. Settings
- Badge "Giọng AI đang bật/tắt" khi capability `aiVoice`; toggle "Dùng giọng AI (ElevenLabs) khi có".
- Khi bật: danh sách giọng đã chọn lọc cho accent hiện tại (tên + tier + subtitle, nút nghe thử từng giọng qua `speakCurated({voice: id})`), và danh sách giọng cho Coach tiếng Việt. Vị trí 0 = mặc định server (không lưu id).
- Khi tắt/không key: mô tả giọng trình duyệt như Plan14.

## 4. Tích hợp màn hình
| Màn hình | Thay đổi |
|---|---|
| Games quiz | Tự đọc `content.word` khi lượt hiện (nếu `autoSpeak`); nút "Nghe từ" (`SpeakButton`). |
| Games match | Thẻ từ có nút loa compact (stopPropagation, không chọn thẻ). |
| Games spell | `HiddenAudioButton` autoPlay, fallback file; thông báo 503 nhẹ nhàng. |
| Bài AI riêng | SPELL: "Nghe từ cần viết" (hidden route, autoPlay); CHOICE/FILL: "Nghe câu hỏi" (`SpeakButton` prompt). |
| Session player | Phiên mới (chưa có lượt học viên) tự đọc lượt mở đầu (`autoSpeak`, `coachVoice`, `rate`). |
| Bài học | `audioAvailable` = có file **hoặc** có text đoạn/transcript → nút "Nghe" ở mọi bài. |
| Flashcards | `speakCurated`. |

## 5. Bằng chứng
- Unit: preferences (3), capabilities (3), composite (4), settings/static (Plan14 test giữ), E2E `voice-everywhere.spec` (capability false, 401, quiz "Nghe từ", spell 503 message).
- Thủ công với key (OPERATIONS §3): nghe thật trên từng màn hình.
