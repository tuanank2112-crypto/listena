# Hợp đồng voice của ListenAI (trích từ Plan14/15, ADR 0002/0003)

Nguồn chân lý là mã + spec; file này là bản tóm tắt để tra nhanh. Nếu lệch, mã và `planning/15_2026-09-18_voice-everywhere-elevenlabs/specs/SPEC-P150-ELEVENLABS.md` thắng.

## Module

| Tầng | File | Vai trò |
|---|---|---|
| Server provider | `src/server/voice/elevenlabs.ts` | `resolveElevenLabsConfig`, `isElevenLabsConfigured`, `getCuratedVoiceCatalogue` (≤5 trang×100, cache 1 h), `resolveVoiceId`, `synthesizeSpeech` (cap 600, timeout 20 s, cache sha256). Hằng: `DEFAULT_MODEL_EN=eleven_multilingual_v2`, `DEFAULT_MODEL_VI=eleven_flash_v2_5`, `DEFAULT_OUTPUT_FORMAT=mp3_44100_64`. |
| Server lỗi → HTTP | `src/server/voice/http.ts` | `voiceProviderErrorResponse`, `voiceNotConfiguredResponse`, `audioResponse`, `VOICE_NO_STORE`. |
| Chính sách giọng | `src/core/voice/elevenlabs-voice-policy.ts` | `buildCuratedCatalogue(voices)`: điểm = 50 + (30 − index) theo `TOP_NAME_ORDER` (Talia, Elara, Alicia, Rachel, Sarah, Finley, Lawrence, Eldrin, Caleb, Antoni, Charlotte, Alice, Laura, Matilda, Lily, Eddie…); loại giọng nhân vật/novelty; tier TOP ≥75, GOOD ≥40, OK; en tối đa 8, xen kẽ nữ/nam; vi ưu tiên `verified_languages` có `vi`. |
| Văn bản nói | `src/core/voice/spoken-text.ts`, `voice-script.ts`, `voice-policy.ts` | `prepareSpokenText`, `speakCurated/speakLines/speakVoiceScript`, chính sách giọng trình duyệt NEURAL>PREMIUM>SYSTEM>REMOTE. |
| Client engine | `src/core/tts/*` (`elevenlabs-engine`, `composite-engine`) | en: ElevenLabs → WebSpeech; vi: Composite[ElevenLabs → VieNeu] → WebSpeech. |
| Client UI | `src/features/voice/*` | `SpeakButton`, `HiddenAudioButton`, `voice-capabilities.ts` (`GET /api/voice/tts` 1 lần/trang), `voice-preferences.ts` (`localStorage listena.voice.v1`: engine auto|browser, aiVoices theo key), `voice-settings.tsx`. |
| Phát âm | `src/core/voice/pronunciation.ts`, `src/server/voice/pronunciation-service.ts` | STT trình duyệt + chấm mức từ trên server; ghi `VOICE_PRACTICE` khi có sessionId. KHÔNG ghi mastery. |
| Công cụ | `scripts/voice-doctor.ts` (`npm run voice:doctor [-- --probe]`) | Xếp hạng giọng của tài khoản, probe 1 câu. Không in key. |

## Endpoint

| Method/Path | Auth | Vào | Ra |
|---|---|---|---|
| `GET /api/voice/tts` | phiên đăng nhập | — | `{ enabled: boolean, voices: { "en-US": PublicCuratedVoice[], "en-GB": [...], vi: [...] } }`; `PublicCuratedVoice = { id, name, subtitle, accent, gender, tier, previewUrl }`. Không key ⇒ `enabled:false` (200). |
| `POST /api/voice/tts` | phiên đăng nhập | `{ text: string(1..600), lang: "en" \| "vi", accent?: "en-US" \| "en-GB", voiceId?: /^[A-Za-z0-9]{8,64}$/, speed?: 0.5..1.5 }` | `audio/mpeg` bytes; header `X-Voice-Id`, `X-Voice-Cache: HIT\|MISS`, `Cache-Control: private, no-store`. |
| `GET /api/game-runs/{runId}/rounds/{roundId}/audio` | chủ run | — | bytes cho vòng SPELL (đáp án ẩn); FILL/CHOICE bị từ chối. |
| `GET /api/learner/personalized-lessons/{lessonId}/exercises/{exerciseId}/audio` | chủ bài | — | bytes cho từ cần viết / câu hỏi; không đọc đáp án FILL/CHOICE. |
| `POST /api/voice/pronunciation` | phiên | transcript + câu mục tiêu (+ sessionId) | điểm mức từ; ghi VOICE_PRACTICE. |

## Env (chỉ server; `.env` local không commit, Vercel Production + Preview)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `ELEVENLABS_API_KEY` | không (thiếu = fallback giọng trình duyệt) | key quyền text-to-speech + voices read (+ user read để `GET /v1/user` kiểm) |
| `ELEVENLABS_MODEL_EN` | không | mặc định `eleven_multilingual_v2` |
| `ELEVENLABS_MODEL_VI` | không | mặc định `eleven_flash_v2_5`; `eleven_v3` nếu tiếng Việt kém (đắt/chậm hơn) |
| `ELEVENLABS_VOICE_EN_US`, `ELEVENLABS_VOICE_EN_GB`, `ELEVENLABS_VOICE_VI` | không | ghim voice ID — cách duy nhất chọn ID cụ thể |

## Bảng lỗi và hành vi caller

| HTTP | `code` | Nguyên nhân | Caller phải |
|---|---|---|---|
| 400 | `VOICE_INVALID_INPUT` | text rỗng / >600 / voiceId sai định dạng / lang lạ | Sửa input; không retry. |
| 401 | — | chưa đăng nhập | Không phát; không fallback ngầm. |
| 429 | `VOICE_RATE_LIMITED` | ElevenLabs 429 | Đọc `Retry-After`; fallback giọng trình duyệt cho lượt này. |
| 503 | `VOICE_NOT_CONFIGURED` / `VOICE_UNAUTHORIZED` / `VOICE_QUOTA_EXCEEDED` | không key / key sai / hết quota | Fallback giọng trình duyệt; báo user cấu hình (không lộ key). |
| 502 | `VOICE_UPSTREAM` | ElevenLabs 5xx hoặc lỗi lạ | Fallback; log server. |
| 504 | `VOICE_TIMEOUT` | quá 20 s | Fallback. |

## Bằng chứng hiện có
- Unit: `elevenlabs-voice-policy.test.ts` (7), `elevenlabs.test.ts` (9: config, catalogue+cache, header key, body/URL/model/speed, cache HIT, vi fallback, voiceId lạ, override, 429/5xx).
- E2E `voice-everywhere.spec`: đường degrade không key; chờ 10,5 s giữa hai lượt game (cooldown server, không giảm để chiều test).
- Production 2026-09-18: deploy `dpl_ASe6Egqu6AWKRMvgrhtEyZsx91E2` READY; các route audio đúng auth boundary. Chưa có key thật trên Vercel/local (Plan16 WP2/WP4 mở).
