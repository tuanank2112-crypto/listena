# 00 — Kiến trúc Plan14 (Voice AI)

## Mục tiêu

1. Học viên **nghe** AI bằng giọng tiếng Anh chuẩn nhất thiết bị có, đọc đúng những gì nên đọc (câu NPC, câu đã sửa), không đọc rác (markdown, emoji, IPA) và không đọc câu sai của chính mình.
2. Học viên **nói** để trả lời Mission/Coach/Quest và **nói lại** câu mẫu; máy chấm mức từ trên server, không đưa audio lên server.
3. Toàn bộ chạy trên Vercel Node runtime hiện tại: không sidecar, không biến môi trường mới, không nhà cung cấp trả phí (Vyce không có model audio — probe 2026-09-18).

## Non-goals (vùng cấm phạm vi)

CẤM: STT/TTS phía server; gửi audio lên server hoặc bên thứ ba qua mã của ta; TTS trả phí (OpenAI/ElevenLabs/Azure); chấm phoneme/accent (chỉ có mức từ); ghi `LearningEvidence`/mastery/planner từ điểm phát âm; đổi contract `TutorTurnOutput`/prompt; migration DB; đụng `prisma/dev.db`, Turso, Vercel từ agent; đổi VieNeu sidecar (giữ nguyên cho local).

## Bất biến

- BẮT BUỘC mọi chuỗi đi vào giọng đọc phải qua `prepareSpokenText` (`speakCurated`/`speakLines`/`speakVoiceScript`); `speak()` thô chỉ còn cho test/engine nội bộ. Grep `speak(` trong `src/**/*.tsx` phải bằng 0 ngoài các hàm curated.
- BẮT BUỘC kịch bản giọng cho lượt AI do **server** dựng (`toLearningSessionDto` → `voiceScript`); client không tự suy diễn từ `content`.
- CẤM đọc `detectedError.actual`. RECAST chỉ đọc `detectedError.expected` khi ≥ 2 từ và khác `actual`.
- BẮT BUỘC câu tiếng Việt (có dấu) không bao giờ vào giọng tiếng Anh; câu không dấu có chữ Latin là tiếng Anh.
- BẮT BUỘC accent do học viên chọn luôn thắng tier giọng; giọng novelty bị loại tuyệt đối; Google chỉ là dự phòng cuối.
- BẮT BUỘC điểm phát âm chỉ được ghi vào phiên khi câu nằm trong `voiceScript` NPC/RECAST của **đúng phiên** thuộc **đúng chủ sở hữu**; ghi bằng `recordLearningEvent` (idempotent theo `voice-<clientAttemptId>`, đếm vào cap 200 sự kiện). Route `/events` công khai từ chối `VOICE_PRACTICE`.
- BẮT BUỘC khi trình duyệt không có recogniser: không hiện mic, đường gõ nguyên vẹn, settings nói rõ lý do. SSR luôn render "không có mic" để không lệch hydration.
- BẮT BUỘC bắt đầu thu âm thì dừng giọng đang phát (tránh máy nghe chính AI).
- CẤM log transcript/expected ở server (chỉ mã lỗi typed).

## Ma trận lỗi cấp kế hoạch

| Tình huống | Hành vi bắt buộc |
|---|---|
| Không có giọng tiếng Anh nào chấp nhận được | `chooseEnglishVoice` → `undefined`; utterance dùng `lang` accent, trình duyệt tự chọn; settings hiện "Chưa có giọng tiếng Anh phù hợp". |
| Web Speech `onerror` "interrupted/canceled" do chính ta cancel | Coi là **cancelled**, không phải failed; không kích hoạt fallback. |
| Recogniser lỗi `not-allowed`/`no-speech`/`network`/`audio-capture` | Trạng thái `error` + thông báo tiếng Việt cạnh nút; không đổi draft. |
| Câu luyện không thuộc phiên | 400 `EXPECTED_NOT_IN_SESSION`; không ghi gì. |
| Phiên không ACTIVE khi ghi `VOICE_PRACTICE` | `recordLearningEvent` ném `SESSION_CONFLICT` 409 (hành vi có sẵn); client hiện lỗi, điểm vẫn đã tính nhưng không lưu. |
| Vượt 200 sự kiện | 429 `EVENT_LIMIT` (có sẵn). |
