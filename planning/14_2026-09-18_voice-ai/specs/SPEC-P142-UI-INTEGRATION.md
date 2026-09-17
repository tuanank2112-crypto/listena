# SPEC-P142 — UI: preferences, nút mic, settings, Repeat-after-me, Session Player

## 1. Thành phần

| Thành phần | File | Trách nhiệm |
|---|---|---|
| `useVoicePreferences` / `setVoicePreferences` | `src/features/voice/voice-preferences.ts` | `{ accent, rate 0.8|0.92|1, autoSpeak, coachVoice }`, localStorage `listena.voice.v1`, sanitize từng trường, snapshot server = mặc định. |
| `useVoiceInput` | `src/features/voice/use-voice-input.ts` | `supported` qua `useSyncExternalStore` (server = false); phase idle/listening/error; `start()` gọi `stopSpeech()` trước. |
| `VoiceInputButton` | `voice-input-button.tsx` | push-to-talk; interim + lỗi cạnh nút; không recogniser → `unsupportedFallback` (mặc định null). `data-voice-status`. |
| `VoiceSettings` | `voice-settings.tsx` | accent select, 3 tốc độ, autoSpeak, coachVoice, "Nghe thử giọng", mô tả giọng đang dùng (tên + tier + cảnh báo accent), cảnh báo Firefox. |
| `RepeatAfterMe` | `repeat-after-me.tsx` | "Nghe mẫu" (RECAST_RATE × rate) + "Nói lại" → POST pronunciation → chip từng từ (MATCH/CLOSE/MISSED/EXTRA), verdict %, "Máy nghe", feedbackVi, "Thử lại". `data-repeat-line`, `data-pronunciation-verdict`. |

## 2. Session Player (`session-player.tsx`)

- Header: nút "Cài đặt giọng nói" (AudioLines) toggle `VoiceSettings` dưới thanh tiến độ.
- Auto-đọc: ref `lastSpokenTurnRef` khởi tạo = AI turn cuối lúc load (không đọc lại lịch sử); AI turn mới + `autoSpeak` + không terminal → `speakVoiceScript(script, { includeCoach: coachVoice, rateScale: rate })`.
- `replayTurn(turn)`: đếm REPLAY + ghi event như cũ; có `voiceScript` → đọc NPC+RECAST (không coach); không có → `speakCurated(npcReply)`.
- `replay(text)` cho intervention `audioText` → `speakCurated`.
- Bubble AI: nút loa + nút mic "Luyện nói theo câu này" (chỉ khi có `repeatableLines`), mở tối đa 3 `RepeatAfterMe` với `sessionId`.
- Form trả lời: `VoiceInputButton` cạnh "Gợi ý Socratic"; transcript nối vào draft (giữ phần đã gõ). Không tự gửi (học viên vẫn bấm "Gửi câu trả lời" — quyết định: tránh gửi nhầm khi máy nghe sai).
- Unmount → `stopSpeech()`.

## 3. Các trang khác

- `lesson-client.tsx`: `speakEnglish` và nút đọc phản hồi tutor (vi) → `speakCurated`.
- `personalized-lesson-player.tsx`, `answer-canvas.tsx`: nút nghe từ/câu → `speakCurated`.
- `providers.tsx`: `WebSpeechEngine({ getAccent })` đọc preferences mỗi utterance.

## 4. Header

`next.config.ts`: `Permissions-Policy: camera=(), microphone=(self), geolocation=()`. CSP không đổi (recogniser trình duyệt không chịu CSP của trang).

## 5. Khả năng truy cập / hydration

- Mọi nút có `aria-label`; trạng thái nghe `aria-pressed`; interim `aria-live="polite"`; lỗi `role="alert"`.
- SSR: `supported=false` → không mic; client hydrate rồi mới hiện mic (tránh mismatch). Test tĩnh xác nhận.

## 6. Bằng chứng nghiệm thu

- `voice-preferences.test.ts` 3 ca; `repeat-after-me.test.tsx` 2 ca (SSR không mic; fallback).
- E2E `voice-ai.spec.ts`: stub recogniser → mic điền textarea đúng transcript → gửi → hiển thị; settings mở/đóng, accent mặc định en-US; không recogniser → không mic, textarea còn, settings cảnh báo.
- Smoke thủ công trên thiết bị thật: OPERATIONS §3 (không tự động hoá được chất lượng giọng/micro).
