# SPEC-P141 — Nói vào (STT trình duyệt) và chấm phát âm trên server

## 1. Nguyên tắc

Audio không rời trình duyệt qua mã của ta. Trình duyệt (Chrome/Edge/Safari) tự nhận dạng bằng dịch vụ của nó và trả **văn bản**; server chỉ nhận văn bản và chấm tất định. Không có STT server (vùng cấm: tải audio lên Vercel/Vyce — Vyce không có model audio; upload audio đổi mô hình riêng tư của sản phẩm).

## 2. Wrapper recogniser (`src/core/voice/speech-recognition.ts`)

```ts
isSpeechRecognitionSupported(): boolean            // window.SpeechRecognition || webkitSpeechRecognition
createBrowserRecognizer(): Recognizer | null
Recognizer.start({ lang, onInterim?, signal?, maxDurationMs? }): Promise<{ transcript; confidence: number|null; alternatives: string[] }>
Recognizer.stop(); Recognizer.abort()
VoiceInputError.code: "unsupported"|"not-allowed"|"no-speech"|"audio-capture"|"network"|"aborted"|"failed"
```

- Một lần `start` = một utterance (`continuous=false`, `interimResults=true`, `maxAlternatives=3`), hết `maxDurationMs` (15 s) thì `stop()` để chốt kết quả.
- `onend` không có final → `no-speech`; `signal.abort()` → `aborted`; `onerror` map theo bảng `mapRecognitionError`.
- `describeVoiceInputError(code)` trả câu tiếng Việt cho UI.

## 3. Chấm phát âm (`scorePronunciation`)

- Reuse `assessDictation(expected, transcript)` → `wordDiffs`.
- Map: CORRECT → MATCH; SPELLING → CLOSE (0.5 điểm); MISSING → MISSED; EXTRA → EXTRA (phạt 0.1/từ, tối đa 0.3); SUBSTITUTION đồng âm (bảng `HOMOPHONE_GROUPS`: their/there/they're, to/too/two, …) → MATCH, còn lại MISSED.
- `score = clamp01(credit/expectedWords − penalty)`, làm tròn 2 chữ số; transcript rỗng → 0.
- `verdict`: ≥ 0.85 GOOD; ≥ 0.6 ALMOST; còn lại RETRY. `retryWords` = từ expected chưa MATCH theo thứ tự câu. `feedbackVi` theo verdict, nêu tối đa 3 từ.
- `recognitionConfidence` chỉ echo (clamp 0..1), **không** ảnh hưởng điểm (độ tin cậy của recogniser không ổn định giữa trình duyệt).

## 4. Service + ghi sổ (`practicePronunciation`)

1. Tính điểm.
2. Không `sessionId` → `{ result, recorded: false }`, không đụng DB.
3. Có `sessionId`: `repository.findOwned(userId, sessionId)` (404 nếu không); dựng DTO; tập câu hợp lệ = `repeatableLines(turn.voiceScript)` của mọi AI turn; so sánh `normalizeText` bằng nhau; không khớp → `VoiceLineNotInSessionError` (400 `EXPECTED_NOT_IN_SESSION`).
4. `recordLearningEvent(userId, sessionId, { type: "VOICE_PRACTICE", value: round(score×100), clientEventId: "voice-<clientAttemptId>" })` — idempotent, tuân cap 200, cần ACTIVE.
5. Trả `{ result, recorded: true }`.

Vùng cấm: không tạo `LearningEvidence`, không cập nhật `SkillMastery`, không thêm skillKey mới; planner `p11-v1` không đọc `VOICE_PRACTICE`. Lý do: điểm mức từ từ STT chưa được kiểm chứng là bằng chứng kỹ năng; ghi sai sẽ làm "AI có bằng chứng rằng bạn cần củng cố X" nói dối (bất biến nhân quả Plan11/12).

## 5. Route

`src/app/api/voice/pronunciation/route.ts`: auth → role → Zod → service → `learningSessionErrorResponse` (mã typed + Retry-After có sẵn). Không log body.

## 6. Bằng chứng nghiệm thu

- `speech-recognition.test.ts` 5 ca (không hỗ trợ; final + interim + one-shot flags; typed error; no-speech/aborted; map + mô tả).
- `pronunciation.test.ts` 6 ca (exact; đồng âm; retryWords; rỗng; CLOSE/EXTRA; confidence không đổi điểm).
- `pronunciation-service.test.ts` 5 ca (không session không DB; ghi % đúng key; recast được/actual không; 400 typed; 404 ownership).
- `route.test.ts` 6 ca (401; 403; 400 body/JSON; 200 private no-store; transcript rỗng; map lỗi typed).
- E2E `voice-ai.spec.ts`: modelled line → 200 recorded GOOD; câu lạ → 400; không session → recorded false; `/events` từ chối VOICE_PRACTICE; 401 khi chưa đăng nhập.
