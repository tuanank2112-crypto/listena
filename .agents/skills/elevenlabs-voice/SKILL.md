---
name: elevenlabs-voice
description: Giọng AI ElevenLabs trong ListenAI — thêm "Nghe" cho một màn hình, chọn/ghim giọng, cấu hình key, chẩn đoán 503/502/429, kiểm chi phí. Dùng khi việc chạm tới voice, TTS, ElevenLabs, /api/voice/tts, route audio đáp án ẩn, voice:doctor hoặc ELEVENLABS_*. Bọc skill text-to-speech + setup-api-key gốc của ElevenLabs (MIT) bằng hợp đồng của repo này; hợp đồng repo thắng khi hai bên khác nhau.
license: MIT cho phần upstream (© ElevenLabs, xem references/upstream/LICENSE); phần ràng buộc repo theo giấy phép của repo
compatibility: Đọc offline được. Gọi thật cần ELEVENLABS_API_KEY (chỉ ở server/.env, không commit) và internet tới api.elevenlabs.io.
metadata: {"source": "https://github.com/elevenlabs/skills @ 9edcbd4 (2026-09-09)", "repo_contract": "planning/15_2026-09-18_voice-everywhere-elevenlabs/specs/SPEC-P150-ELEVENLABS.md", "adr": "docs/adr/0003-elevenlabs-voice.md"}
---

# ElevenLabs Voice — skill của ListenAI

Skill này **không phải** mã gọi API. Nó là hợp đồng + quy trình để agent làm việc với giọng AI trong repo này đúng cách, gói kèm nguyên bản hai skill của ElevenLabs (`text-to-speech`, `setup-api-key`) làm tài liệu tham chiếu API.

## Thứ tự đọc

1. File này (luật + công thức).
2. [references/listenai-voice-contract.md](references/listenai-voice-contract.md) — endpoint, env, mã lỗi, module trong repo.
3. Khi cần tham số API (model, voice_settings, output_format, streaming): [references/upstream/text-to-speech.SKILL.md](references/upstream/text-to-speech.SKILL.md), [voice-settings.md](references/upstream/voice-settings.md), [streaming.md](references/upstream/streaming.md).
4. Khi cần cấu hình key: [references/upstream/setup-api-key.SKILL.md](references/upstream/setup-api-key.SKILL.md).
5. Nguồn quyết định: `docs/adr/0003-elevenlabs-voice.md` → `planning/15_2026-09-18_voice-everywhere-elevenlabs/specs/SPEC-P150-ELEVENLABS.md`, `OPERATIONS.md`.

## Luật của repo (thắng upstream khi mâu thuẫn)

| # | BẮT BUỘC / CẤM | Lý do |
|---|---|---|
| R1 | **CẤM hard-code voice ID** trong mã hoặc hướng dẫn cho repo (upstream dùng `JBFqnCBsd6RMkjVDRZzb` George, Sarah, Daniel, Charlotte… — chỉ là ví dụ API). Giọng lấy từ `GET /v2/voices` của tài khoản và xếp hạng bằng `src/core/voice/elevenlabs-voice-policy.ts`; ghim chỉ bằng env `ELEVENLABS_VOICE_EN_US / EN_GB / VI`. | Giọng Default hết hạn 31/12/2026, chỉ tài khoản trước 03/2026 có; ID khác nhau giữa tài khoản. |
| R2 | **CẤM gọi ElevenLabs từ trình duyệt**; key chỉ ở server (`src/server/voice/elevenlabs.ts`). Client đi qua `POST /api/voice/tts` hoặc route audio của đối tượng. | Lộ key. |
| R3 | **CẤM thêm SDK `@elevenlabs/elevenlabs-js`, gói `elevenlabs` (Python) hay CLI vào dependencies** nếu không có plan riêng. Repo dùng `fetch` thuần tới `https://api.elevenlabs.io` (origin cố định trong code). | Upstream hướng dẫn SDK; repo đã có provider mỏng, có test. |
| R4 | **CẤM để app câm khi không có key**: không key ⇒ `GET /api/voice/tts` trả `enabled:false`, route audio 503, client dùng giọng trình duyệt (Plan14). Không được xoá đường fallback hay test của nó. | Vercel không có key vẫn phải chạy. |
| R5 | **CẤM đọc thành tiếng** `detectedError.actual` (câu sai của học viên) và đáp án của bài FILL/CHOICE. Đáp án ẩn (SPELL, game round) chỉ được đọc qua route server-side trả bytes. | Không dạy lỗi, không lộ đáp án. |
| R6 | **CẤM ghi mastery / LearningEvidence / planner** từ việc nghe hay điểm phát âm. | Vùng cấm Plan14/15. |
| R7 | **CẤM in, dán, echo key** trong chat, log, commit; `.env` là nơi duy nhất ở local; Vercel env ở production. Kiểm key bằng `GET /v1/user` (header `xi-api-key`) hoặc `npm run voice:doctor`. | Theo setup-api-key upstream. |
| R8 | Mọi chuỗi vào giọng phải qua `prepareSpokenText` (`src/core/voice/spoken-text.ts`) — sạch markdown/emoji/IPA, tách câu, tách vi/en. Text ≤ 600 ký tự/request (`ELEVENLABS_MAX_TEXT_CHARS`). | Chi phí + chất lượng. |
| R9 | Model mặc định: en = `eleven_multilingual_v2`, vi = `eleven_flash_v2_5` (multilingual_v2 không có tiếng Việt). `eleven_v3` chỉ là override qua env `ELEVENLABS_MODEL_*`. Không streaming/WebSocket. | ADR 0003 "Phương án đã loại". |
| R10 | Thay đổi chạm DB, endpoint mới, ngân sách TTS theo user ⇒ MINOR ⇒ mở plan có bộ SPEC. Skill này chỉ hướng dẫn, không cấp phép đổi kiến trúc. | Luật khung AGENTS.md. |

## Công thức

### A. Thêm "Nghe" cho một màn hình
1. Text công khai (từ, câu ví dụ, câu hỏi, lượt NPC): dùng `SpeakButton` (`src/features/voice/speak-button.tsx`) hoặc `speakCurated/speakLines` (`src/core/voice/voice-script.ts`). Chuỗi tự động qua `prepareSpokenText` và chuỗi engine ElevenLabs → giọng trình duyệt.
2. Text là đáp án ẩn: dùng `HiddenAudioButton` (`src/features/voice/hidden-audio-button.tsx`) trỏ tới route audio server-side (`/api/game-runs/{run}/rounds/{round}/audio`, `/api/learner/personalized-lessons/{id}/exercises/{ex}/audio`). Server đọc text từ DB; FILL/CHOICE bị từ chối.
3. Lượt AI trong phiên: server dựng `voiceScript` (NPC en, RECAST = `detectedError.expected`, COACH vi). Không tự ghép text ở client.
4. Test: unit cho text/policy; E2E chỉ kiểm đường degrade (không key). Chạy đủ 5 gate trước khi báo xong: `npm run type-check`, `npx eslint .`, `npx vitest run`, `npm run build`, `npm run test:e2e`.

### B. Bật key lần đầu (local / Vercel)
1. Làm theo `references/upstream/setup-api-key.SKILL.md` **trừ** việc dán key vào chat. Local: user tự ghi `ELEVENLABS_API_KEY=...` vào `.env`.
2. `set -a; . ./.env; set +a; npm run voice:doctor -- --probe` — in bảng xếp hạng en-US / en-GB / vi (tên, tier, id), có/không giọng Default cũ, kích thước audio probe. Không in key.
3. Muốn ghim giọng: `ELEVENLABS_VOICE_EN_US=<id>` (v.v.) — đây là cách DUY NHẤT chọn ID cụ thể.
4. Vercel: thêm env cho Production + Preview → redeploy → smoke theo `planning/15_.../specs/OPERATIONS.md` §2 (capability `enabled:true`, Mission tự đọc lượt mở đầu, 3 game, bài riêng, settings, header `Permissions-Policy: microphone=(self)`).

### C. Chẩn đoán "Giọng AI hiện chưa sẵn sàng"
Xem bảng mã lỗi trong `references/listenai-voice-contract.md`. Tóm tắt: 503 `VOICE_NOT_CONFIGURED/UNAUTHORIZED/QUOTA_EXCEEDED` = key/quota, client tự fallback; 429 `VOICE_RATE_LIMITED` có `Retry-After`; 502/504 = upstream/timeout, fallback; 400 `VOICE_INVALID_INPUT` = lỗi caller (text rỗng/quá 600/voiceId sai định dạng). Header `X-Voice-Cache: HIT|MISS`, `X-Voice-Id` giúp đối chiếu.

### D. Chi phí
Cap 600 ký tự/request, cache 2 tầng (server theo sha256(voice, model, text, speed); client theo capability 1 lần/trang). Đặt usage alert trên dashboard ElevenLabs. Đọc log Vercel: tỉ lệ `X-Voice-Cache: HIT`, số 429/503. Có dấu hiệu lạm dụng ⇒ đề xuất plan MINOR "ngân sách TTS theo user", không tự làm.

## Khác biệt so với upstream (đọc trước khi chép mã từ upstream)

| Upstream text-to-speech | ListenAI |
|---|---|
| SDK Python/JS/CLI, `client.textToSpeech.convert(voiceId, …)` | `fetch` thuần trong `src/server/voice/elevenlabs.ts`, `synthesizeSpeech(config, input)` |
| Voice ID viết cứng trong ví dụ | Xếp hạng động + env override (R1) |
| `eleven_v3` "highest quality" | Override tuỳ chọn; mặc định multilingual_v2 / flash_v2_5 (R9) |
| Streaming / WebSocket | Không dùng (câu ngắn, Vercel) |
| `mp3_44100_128` mặc định | `mp3_44100_64` (`DEFAULT_OUTPUT_FORMAT`) |
| Key từ `ELEVENLABS_API_KEY` env | Giống, nhưng chỉ server; thiếu key = 503 + fallback (R4) |

## Nguồn
- ElevenLabs skills: https://github.com/elevenlabs/skills (MIT), commit `9edcbd4` ngày 2026-09-09; bản sao nguyên văn trong `references/upstream/`. Cập nhật bằng cách chép lại file từ upstream, KHÔNG sửa tay bản sao; sửa ràng buộc ở file này và `listenai-voice-contract.md`.
