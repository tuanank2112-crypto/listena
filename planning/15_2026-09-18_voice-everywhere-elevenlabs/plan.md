# Plan 15 — Voice ở mọi màn hình + giọng AI ElevenLabs chọn lọc

- STT: 15
- Created: 2026-09-18 (sáng), Asia/Saigon
- Status: LOCAL ACCEPTED (2026-09-18) — vitest 126/779; eslint 0 lỗi; type-check 0; build PASS; Playwright 38/38. CI ⬜, production ⬜ (user thêm `ELEVENLABS_API_KEY` trên Vercel rồi deploy).
- SemVer: MINOR (provider TTS mới, 3 endpoint mới, preferences mới). Version giữ 0.7.0; bump khi CI xanh và user duyệt (cùng Plan14).
- Owner: root (một agent). Input: user 2026-09-18 sau khi deploy Plan14: "voice chỉ có ở vài nơi (đọc từ trong bài); trò chơi và học giao tiếp không có gì để nghe; ElevenLabs có nhiều giọng hay — research, chọn giọng được đánh giá cao nhất, đưa vào voice của repo".
- Environments: local (vitest, Playwright DB tạm :3100 **không có key ElevenLabs** → kiểm đường degrade), `next build` → CI → Production (Vercel + key thật; smoke thủ công).

## Bằng chứng khảo sát (2026-09-18 02:00+07)

| Màn hình | Trước Plan15 |
|---|---|
| Games: Chọn nhanh / Ghép cặp | Không có nút nghe nào. |
| Games: Nghe & viết | Chỉ phát file `audioUrl` sinh sẵn; trên Vercel `public/tts` bị gitignore → nút nghe **bị vô hiệu** ("Tệp nghe chưa sẵn sàng"). Đáp án ẩn nên client không thể tự đọc. |
| Bài AI riêng | Chỉ nghe từ vựng ở sidebar; câu hỏi và bài "Viết chính tả" không có âm thanh (đáp án ẩn). |
| Mission/Coach (học giao tiếp) | Có voice Plan14 nhưng **lượt mở đầu của NPC không được tự đọc** (ref khởi tạo bằng lượt cuối) → cảm giác "không có gì để nghe" khi mới vào phiên. |
| Bài học | Nút "Nghe" chỉ hiện khi có file hoặc FULL_DICTATION. |
| Flashcards | Dùng `speak` thô. |
| ElevenLabs | Chưa có. Research: API `POST /v1/text-to-speech/{voice_id}` (header `xi-api-key`), `GET /v2/voices`; model `eleven_multilingual_v2` (en, ổn định nhất), `eleven_flash_v2_5`/`eleven_v3` (có tiếng Việt). **Giọng Default (Rachel, Sarah, George, Brian, Daniel…) hết hạn 31/12/2026, chỉ tài khoản tạo trước 03/2026 mới có**; bộ thay thế vĩnh viễn: Talia, Elara, Alicia, Finley, Lawrence, Eldrin, Caleb, Eddie, Wyatt, Darian… Reviewer 2026 đánh giá cao cho e-learning/narration: Rachel, Sarah, Charlotte, Antoni, Adam, Brian. |

## Nhật ký quyết định

- 2026-09-18 02:10+07: **Không hard-code voice ID.** Server đọc `GET /v2/voices?category=premade` của chính tài khoản, xếp hạng bằng `elevenlabs-voice-policy` (bảng tên ưu tiên từ research + nhãn accent/use_case/mô tả; loại giọng nhân vật/novelty; accent yêu cầu thắng), cache 1 giờ. Env override `ELEVENLABS_VOICE_*` khi user muốn ghim. `npm run voice:doctor` in ra bảng xếp hạng thật của tài khoản.
- 2026-09-18 02:15+07: Model: en = `eleven_multilingual_v2` (ổn định, hỗ trợ `speed`), vi = `eleven_flash_v2_5` (rẻ, nhanh, có tiếng Việt; `multilingual_v2` không có vi). Override bằng env. Tốc độ dùng `voice_settings.speed` 0.7–1.2 thay vì playbackRate.
- 2026-09-18 02:20+07: Chuỗi engine: en = ElevenLabs → WebSpeech; vi = Composite[ElevenLabs → VieNeu] → WebSpeech. Client probe `GET /api/voice/tts` một lần/trang; không key → engine trả `unavailable` ngay, không tốn round-trip. Người học có thể tắt giọng AI (`engine: browser`) và chọn giọng trong danh sách đã chọn lọc.
- 2026-09-18 02:25+07: **Đáp án ẩn** (Nghe & viết, Viết chính tả bài riêng) chỉ được đọc qua route server đọc text từ DB và trả **audio** (không JSON text): `GET /api/game-runs/{run}/rounds/{round}/audio`, `GET /api/learner/personalized-lessons/{id}/exercises/{ex}/audio`. FILL không được đọc (lộ chỗ trống). Không key → 503 và UI giải thích, gợi ý nghĩa vẫn dùng được.
- 2026-09-18 02:30+07: Voice ở mọi màn hình: quiz tự đọc từ khi lượt hiện + nút "Nghe từ"; thẻ từ ở Ghép cặp có loa; Nghe & viết tự phát; bài riêng có "Nghe câu hỏi"/"Nghe từ cần viết"; phiên AI **tự đọc lượt mở đầu** khi phiên mới; bài học luôn có "Nghe" (đọc đoạn khi không có file); flashcards qua curated.
- 2026-09-18 02:40+07: Chi phí: cap 600 ký tự/request, cache audio server (48 mục/instance) + client (40 mục/trang); không có ngân sách/ngày trong DB — **vùng cấm tạm**: user đặt usage alert trên ElevenLabs; nếu pilot cho thấy lạm dụng thì thêm `VoiceUsage` sau.
- 2026-09-18 03:00+07: Nghiệm thu local (ledger). Không có key ElevenLabs trong `.env` local → đường AI **chưa được nghe thật**; test unit mock `fetch` đúng contract đã research; E2E kiểm đường degrade 503.

## Quyết định bị thay thế

- ADR 0001 "không dùng TTS trả phí, chi phí vận hành bằng không" → **thay bằng** ElevenLabs tuỳ chọn (user yêu cầu 2026-09-18), fail-closed khi không key, browser voice luôn là fallback. Ghi ở ADR 0003.
- Plan14 ADR 0002 "không TTS server" → **thay bằng** TTS server qua ElevenLabs cho văn bản hiển thị và đáp án ẩn; STT vẫn chỉ ở trình duyệt (giữ).
- Plan14 "auto-đọc chỉ lượt AI mới, không đọc lịch sử" → **giữ**, bổ sung ngoại lệ: phiên mới (chưa có lượt học viên) đọc lượt mở đầu.

## Work packages

| WP | Deliverable | Files | Status |
|---|---|---|---|
| P150 | ElevenLabs boundary + chính sách giọng + capability/synthesis routes + doctor | `src/core/voice/elevenlabs-voice-policy.ts`, `src/server/voice/{elevenlabs,http}.ts`, `src/app/api/voice/tts/route.ts`, `scripts/voice-doctor.ts`, `.env.example`, `package.json` | ✅ local |
| P151 | Audio cho đáp án ẩn | `src/server/adaptive-games/service.ts` (`getAdaptiveGameRoundSpeechText`), `src/app/api/game-runs/[runId]/rounds/[roundId]/audio/route.ts`, `src/app/api/learner/personalized-lessons/[lessonId]/exercises/[exerciseId]/audio/route.ts`, `src/features/voice/hidden-audio-button.tsx` | ✅ local |
| P152 | Client engine + composite + capabilities + preferences + settings | `src/core/tts/{elevenlabs-engine,composite-engine}.ts`, `src/features/voice/{voice-capabilities,voice-preferences,voice-settings,speak-button}.tsx`, `src/components/providers.tsx` | ✅ local |
| P153 | Voice ở mọi màn hình | `games-client.tsx`, `personalized-lesson-player.tsx`, `session-player.tsx`, `lesson-client.tsx`, `flashcards-client.tsx` | ✅ local |
| P154 | Docs/não: ADR 0003, README, learning.md, Plan15 specs, brain | `docs/adr/0003-elevenlabs-voice.md`, `README.md`, `docs/learning.md`, `planning/15_*`, `brain4agent/**` | ✅ local |
| P155 | Nghiệm thu: vitest/type-check/lint/build/Playwright; smoke thật với key (user) | — | ✅ local (key ⬜, CI ⬜, production ⬜) |

## Checklist thực thi

- [x] Research ElevenLabs (API, model, giọng Default hết hạn, bộ thay thế, đánh giá reviewer).
- [x] P150–P154.
- [x] P155 gates local.
- [ ] User: tạo key ElevenLabs, chạy `npm run voice:doctor -- --probe` (local, `.env`) để xem bảng giọng và nghe thử; thêm `ELEVENLABS_API_KEY` (+ tuỳ chọn `ELEVENLABS_VOICE_*`) vào Vercel; deploy; smoke theo OPERATIONS §3.
- [ ] CI xanh; quyết định bump version.

## SPEC router

| # | Contract | Phạm vi |
|---|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, bất biến, vùng cấm |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) | Env, endpoint, types, mã lỗi, hằng số |
| 3 | [SPEC-P150-ELEVENLABS](specs/SPEC-P150-ELEVENLABS.md) | Provider, chính sách giọng, capability |
| 4 | [SPEC-P151-HIDDEN-ANSWER-AUDIO](specs/SPEC-P151-HIDDEN-ANSWER-AUDIO.md) | Audio cho đáp án ẩn |
| 5 | [SPEC-P152-CLIENT-VOICE-EVERYWHERE](specs/SPEC-P152-CLIENT-VOICE-EVERYWHERE.md) | Engine client, preferences, tích hợp màn hình |
| 6 | [OPERATIONS](specs/OPERATIONS.md) | Env Vercel, doctor, smoke, chi phí, rollback |
| 7 | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) | Ma trận test + ledger + gates |
