# SPEC-P151 — Audio cho đáp án ẩn

## 1. Vấn đề
"Nghe & viết" (game SPELL) và "Viết chính tả" (bài AI riêng SPELL) giấu đáp án ở server (`validatorJson`). Client không có text nên không thể tự đọc; file sinh sẵn (`VocabularyItem.audioUrl`) không có trên Vercel (`public/tts` gitignore).

## 2. Game: `GET /api/game-runs/{runId}/rounds/{roundId}/audio`
- `getAdaptiveGameRoundSpeechText(userId, runId, roundId)`: `adaptiveGameRound.findFirst({ id, runId, run: { userId } })` select `publicJson`, `vocabularyItem.displayText`; parse public round; chỉ `kind === "spell"`; trả text. Mọi trường hợp khác → `AdaptiveGamePrivateNotFoundError` (404, không phân biệt).
- Route: auth → params uuid → config (503 nếu không) → text → `synthesizeSpeech({ text, lang: "en", accent từ `?accent=`, speed 0.9 })` → bytes + `X-Voice-Cache`. Lỗi provider → typed; lỗi game → `adaptiveGameErrorResponse`.
- Client: `HiddenAudioButton` (size large, autoPlay) với `fallbackUrl = content.audioUrl` (file sinh sẵn nếu có, thử **sau** route server vì route trả 503 nhanh khi không key).

## 3. Bài riêng: `GET /api/learner/personalized-lessons/{id}/exercises/{exerciseId}/audio`
- Owner + READY; `exercise.type === "SPELL"`; text = `validator.exercises[].acceptedAnswers[0]`. FILL/CHOICE → 404 (đọc đáp án = lộ đề). Client: `HiddenAudioButton` size small, autoPlay, label "Nghe từ cần viết"; lỗi hiện `audioNote`.

## 4. UI degrade khi không key
- Route 503 → `HiddenAudioButton` gọi `onError` với "Giọng AI chưa được cấu hình cho lượt này. Bạn vẫn có thể luyện chính tả theo gợi ý nghĩa." Ô nhập vẫn dùng được. E2E `voice-everywhere.spec` kiểm.

## 5. Bằng chứng
- `rounds/[roundId]/audio/route.test.ts` 3 ca; `exercises/[exerciseId]/audio/route.test.ts` 3 ca (401/503; SPELL owner; FILL/unknown/không sở hữu → 404); E2E 3 ca.
