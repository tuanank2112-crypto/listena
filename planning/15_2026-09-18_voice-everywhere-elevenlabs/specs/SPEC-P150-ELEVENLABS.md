# SPEC-P150 — ElevenLabs provider, chính sách giọng, capability

## 1. Research (2026-09-18) — nguồn: ElevenLabs docs/help centre, aivoicereview.com, cognitivefuture.ai
- API: `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_64`, header `xi-api-key`, body `{ text, model_id, language_code, voice_settings{stability, similarity_boost, style, speed, use_speaker_boost}, apply_text_normalization }`. Danh sách giọng: `GET /v2/voices?category=premade&page_size=100` (phân trang `next_page_token`), voice có `labels{accent, gender, age, use_case, description}`, `verified_languages`, `preview_url`.
- Model: `eleven_multilingual_v2` (29 ngôn ngữ, **không vi**, ổn định nhất cho production, 10k ký tự); `eleven_flash_v2_5` (32 ngôn ngữ **có vi**, ~75 ms, rẻ, 40k); `eleven_v3` (70+ ngôn ngữ có vi, biểu cảm cao, 5k, độ trễ cao hơn).
- **Giọng Default** (Roger, Sarah, Laura, Charlie, George, Callum, River, Harry, Liam, Alice, Matilda, Will, Jessica, Eric, Chris, Brian, Daniel, Lily, Bill) **hết hạn 31/12/2026**, chỉ tài khoản tạo trước 03/2026. Thay thế vĩnh viễn: Roger→Darian, Sarah→Talia, Laura→Elara, Charlie→Baxter, George→Eldrin, Callum→Kellan, River→Elowen, Harry→Kaelen, Liam→Lawrence, Alice→Alicia, Matilda→Maisie, Will→Warren, Jessica→Jade, Eric→Eddie, Chris→Caleb, Brian→Sawyer, Daniel→Finley, Lily→Florence, Bill→Wyatt.
- Reviewer 2026 (e-learning/narration rõ ràng): Rachel, Adam, Antoni (e-learning), Brian, Charlotte, Sarah, Josh, Cassidy. Giọng năng lượng cao (Natasha "Valley Girl") và giọng nhân vật không phù hợp làm mẫu phát âm.

## 2. Chính sách xếp hạng (`elevenlabs-voice-policy.ts`)
- Điểm = 50 + bonus thứ tự ưu tiên (30 − index) nếu tên thuộc `TOP_NAME_ORDER` (Talia, Elara, Alicia, Rachel, Sarah, Finley, Lawrence, Eldrin, Caleb, Antoni, Charlotte, Alice, Laura, Matilda, Lily, Eddie, Adam, Brian, George, Daniel, Liam, Chris, Wyatt, Darian, Bill, Roger, Eric, Sawyer, Maisie, Elowen, Florence) hoặc 15 nếu thuộc `OK_NAMES`; +30 đúng accent, +5 accent Anh khác, −10 accent khác; tuổi middle +2 / young +1 / old −4; từ khoá tích cực +3 mỗi từ (cap 9); từ khoá tiêu cực −20 mỗi từ (cap 60); category không phải premade/professional/high_quality −10. Điểm ≤ 0 → loại.
- Tier: ≥ 75 TOP, ≥ 40 GOOD, còn lại OK. Danh sách en tối đa 8, xen kẽ nữ/nam ở 2 vị trí đầu. vi: ưu tiên `verified_languages` có `vi`; nếu không có, giọng trung tính tốt nhất (+20 khi có verified).
- Accent phát hiện từ `labels.accent`, tên, mô tả, `verified_languages[].accent`.

## 3. Provider (`server/voice/elevenlabs.ts`)
- Config fail-closed; override voice phải khớp regex; base URL cố định.
- `getCuratedVoiceCatalogue`: tối đa 5 trang × 100; cache 1 h; lỗi HTTP → typed.
- `synthesizeSpeech`: chuẩn hoá khoảng trắng; cap 600; resolve voice (explicit ∈ catalogue/override → override → best key → fallback key khác); model theo lang; `speed` clamp; cache sha256(voice, model, speed, lang, text) 48 mục; trả bytes.
- Vùng cấm: không stream (Vercel Node trả buffer đủ nhỏ cho ≤ 600 ký tự); không dùng `eleven_v3` mặc định (độ trễ/giá; user có thể override).

## 4. Capability (`GET /api/voice/tts`)
- Client store `voice-capabilities.ts`: probe một lần/trang, dedupe inflight, 401/lỗi → `aiVoice:false`.
- Engine `ElevenLabsSpeechEngine.isAvailable()` = `engine !== "browser"` && capability `aiVoice`.

## 5. Bằng chứng
- `elevenlabs-voice-policy.test.ts` 7 ca; `elevenlabs.test.ts` 9 ca (config, catalogue+cache, header key, body/URL/model/speed, cache HIT, vi model + fallback voice, voiceId lạ/rỗng/quá dài, override, 429/5xx).
- `tts/route.test.ts` 7 ca; `voice-capabilities.test.ts` 3 ca; `composite-engine.test.ts` 4 ca.
