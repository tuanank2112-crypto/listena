# 00 — Kiến trúc Plan15

## Mục tiêu
1. Mọi màn hình học đều nghe được: game (3 chế độ), bài AI riêng, phiên Mission/Coach/Quest (kể cả lượt mở đầu), bài học, flashcards.
2. Giọng AI ElevenLabs chọn lọc làm giọng chính; giọng trình duyệt là fallback không bao giờ câm.
3. Đáp án ẩn vẫn ẩn: audio sinh ở server từ text trong DB, không có JSON chứa text.

## Non-goals (vùng cấm)
CẤM: gửi audio/đáp án ẩn xuống client dưới dạng text; STT server; gọi ElevenLabs từ trình duyệt; đọc `process.env` ngoài `resolveElevenLabsConfig`; base URL cấu hình được (allowlist trong code); hard-code voice ID trong mã (chỉ env override); ghi bằng chứng/mastery từ việc nghe; đổi schema DB; migration.

## Bất biến
- BẮT BUỘC mọi tổng hợp giọng đi qua `synthesizeSpeech` (cap 600 ký tự, timeout 20 s, cache).
- BẮT BUỘC `voiceId` từ client phải nằm trong catalogue đã chọn lọc của đúng key (`en-US`/`en-GB`/`vi`) hoặc là env override; ngược lại 400.
- BẮT BUỘC không key → `GET /api/voice/tts` trả `enabled:false` (200), mọi route audio trả 503 `VOICE_NOT_CONFIGURED`; client engine trả `unavailable` và controller/composite chuyển sang giọng trình duyệt.
- BẮT BUỘC route audio đáp án ẩn: owner-only, chỉ SPELL, trả bytes; header không chứa text.
- BẮT BUỘC accent người học quyết định key en; `speed` áp qua `voice_settings.speed` (0.7–1.2).
- CẤM log text/đáp án; log chỉ `status`/`code`/`model`.

## Ma trận lỗi
| Tình huống | Hành vi |
|---|---|
| Không key | 503 `VOICE_NOT_CONFIGURED`; client fallback im lặng sang browser voice; settings không hiện mục giọng AI. |
| 401/403 từ ElevenLabs (key sai/hết hạn) | 503 `VOICE_UNAUTHORIZED`; fallback; log warn. |
| 429 | 429 + Retry-After (mặc định 15); client coi là `unavailable` lượt này. |
| 402 quota | 503 `VOICE_QUOTA_EXCEEDED`; fallback. |
| Timeout 20 s | 504 `VOICE_TIMEOUT`; fallback. |
| voiceId lạ | 400 `VOICE_INVALID_INPUT`. |
| Round không SPELL / không thuộc user | 404 `PRIVATE_NOT_FOUND` (không phân biệt). |
