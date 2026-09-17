# SPEC-P140 — Curated speech (văn bản nói chuẩn + chính sách giọng + kịch bản lượt AI)

## 1. `prepareSpokenText(text, lang)` — pipeline bắt buộc

Thứ tự cố định (đổi thứ tự = đổi hành vi, phải có test):

1. `normalizeTypography`: NFKC; ‘’ʼ → `'`; “” → `"`; … → `...`; – — → `, `; CRLF → LF.
2. `stripUnspeakable`: URL → " "; IPA `/…/` → " "; `**x**`/`__x__` → `x`; stage direction `[...]` và `*...*` (không dính chữ) → " "; bullet đầu dòng bỏ; `___`/`....` → ` blank `; ký tự markdown `*_`#>~` → " "; emoji → " ".
3. Mở rộng viết tắt có dấu chấm **trước khi tách câu**: e.g./i.e./etc./vs./Mr./Mrs./Ms./Dr./a.m./p.m.
4. Tách câu theo `[.!?]+` hoặc xuống dòng.
5. Mỗi câu: `detectSpokenLang` (có dấu tiếng Việt → vi; có chữ Latin → en; còn lại → fallback). Câu en mở rộng ký hiệu `& % + @ $N vs`.
6. `collapse` khoảng trắng/dấu; câu không có chữ/số → `dropped`.
7. Câu > 240 ký tự tách tại `, ; :` rồi theo từ.
8. `finishSentence`: bỏ dấu nháy mở đầu; viết hoa chữ đầu; thêm `.` nếu thiếu dấu kết.

CẤM: dịch, sửa ngữ pháp bằng heuristic (không có cơ sở), đoán ngôn ngữ bằng từ điển. Vùng cấm đã cân nhắc: dùng LLM để "sửa câu trước khi đọc" — bị loại vì thêm một lượt gọi provider cho mỗi lần bấm nghe và làm câu đọc khác câu hiển thị.

## 2. Chính sách giọng tiếng Anh (`voice-policy.ts`)

- Tier: `NEURAL` (tên chứa natural/neural/premium/enhanced/siri hoặc mã Android `x-xxx-local|network`) > `PREMIUM` (danh sách tên đã biết: Samantha, Daniel, Aria, Jenny, …) > `SYSTEM` > `REMOTE` (tên/URI chứa "google").
- Sắp xếp: accent khớp (2) > tiếng Anh khác (1); rồi tier; rồi `default`; rồi `localService`; rồi tên.
- Loại trừ tuyệt đối (`isExcludedVoice`): danh sách novelty Apple (Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Deranged, Fred, Good News, Grandma/Grandpa, Hysterical, Jester, Junior, Kathy, Organ, Ralph, Rocko, Shelley, Superstar, Trinoids, Whisper, Wobble, Zarvox, …) và tên chứa novelty/whisper/robot/cartoon.
- `accentMatched=false` khi phải dùng accent khác; settings hiển thị.
- Tiếng Việt: giọng `vi-*` không novelty, ưu tiên default.

Engine (`WebSpeechEngine`): `getAccent()` đọc mỗi utterance; `utterance.lang = accent | "vi-VN"`; cache theo `lang:preferred`, xoá cache khi danh sách giọng đổi; `onerror interrupted|canceled` → AbortError (cancelled).

## 3. Kịch bản lượt AI (`buildTurnVoiceScript`)

Input: `content` của AI turn (JSON `TutorTurnOutput`). Output `VoiceScript v1`:

| Role | Nguồn | lang | rate | Điều kiện |
|---|---|---|---|---|
| NPC | `npcReply` → `prepareSpokenText(_, "en")` dòng en | en | 0.95 | luôn |
| COACH | dòng vi lọt trong `npcReply` | vi | 1 | model lỡ viết tiếng Việt vào NPC |
| RECAST | `detectedError.expected` | en | 0.82 | ≥ 2 từ và khác `actual` (so sánh đã chuẩn hoá) |
| COACH | `coachMessage` → dòng vi/en theo detect | vi/en | 1 | luôn |

CẤM đưa `detectedError.actual`, `intervention.validator`, `explanationVi` vào script. `null` khi content không phải object hoặc không có npcReply/coachMessage (turn legacy dạng chuỗi → client dùng `speakCurated`).

DTO: `toLearningSessionDto` gắn `voiceScript` cho `actor === "AI"`; learner/system turn không có trường này.

## 4. Bộ điều khiển phát (`speech.ts`)

- `speakLines(lines)`: token tuần tự; mỗi dòng gọi `speakSingle` theo `lang`; `cancelled` → dừng; `unavailable` (không engine cho lang) → bỏ qua dòng; `speak()`/`stopSpeech()`/`speakLines()` mới → huỷ phần còn lại.
- `speakCurated({text, lang, rate})` = prepare + speakLines; không dòng → `unavailable`.
- `speakVoiceScript(script, {includeCoach=true, rateScale=1})`: rate = clamp(0.5..1.5, line.rate × scale).

## 5. Bằng chứng nghiệm thu

- `spoken-text.test.ts` 10 ca (markdown/emoji/IPA/URL, viết tắt, tách vi/en, blank, câu dài, quote/dash, rỗng).
- `voice-policy.test.ts` 9 ca (tier, novelty, accent thắng tier, fallback accent, Google cuối/duy nhất, underscore locale, vi).
- `voice-script.test.ts` 5 ca (thứ tự/role/rate, không đọc câu sai, bỏ recast 1 từ/giống nhau, vi lọt NPC, null).
- `speech.test.ts` +5 ca (định tuyến theo dòng, bỏ qua lang thiếu engine, huỷ giữa chừng, curated cleaning, includeCoach/rateScale).
- `voice-selection.test.ts` 6 ca cập nhật theo chính sách mới.
