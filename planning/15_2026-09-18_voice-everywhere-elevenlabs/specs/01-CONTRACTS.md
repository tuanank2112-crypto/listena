# 01 — Contracts Plan15

## Env (mới, tất cả tuỳ chọn)
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ELEVENLABS_API_KEY` | (trống = tắt) | Bật giọng AI server-side. |
| `ELEVENLABS_MODEL_EN` | `eleven_multilingual_v2` | Model tiếng Anh. |
| `ELEVENLABS_MODEL_VI` | `eleven_flash_v2_5` | Model tiếng Việt (v2 không có vi). |
| `ELEVENLABS_VOICE_EN_US` / `_EN_GB` / `_VI` | (trống) | Ghim voice_id; bỏ qua xếp hạng. Regex `^[A-Za-z0-9]{8,64}$`. |

Base URL cố định `https://api.elevenlabs.io` (allowlist trong code).

## Endpoints
| Method/Path | Auth | Body/Query | 200 | Lỗi |
|---|---|---|---|---|
| `GET /api/voice/tts` | session | — | `{ enabled, models?, voices: { "en-US": V[], "en-GB": V[], vi: V[] } }`, `V = { id, name, subtitle, accent, gender, tier, previewUrl }`; `Cache-Control: private, max-age=300` | 401; 502/503 typed |
| `POST /api/voice/tts` | session | `{ text ≤600, lang: en\|vi, accent?: en-US\|en-GB, voiceId?, speed?: 0.5–1.5 }` | `audio/mpeg`, headers `X-Voice-Id`, `X-Voice-Model`, `X-Voice-Cache: HIT\|MISS`, `private, no-store` | 400 `INVALID_INPUT`; 401; 503 `VOICE_NOT_CONFIGURED`; 429 `VOICE_RATE_LIMITED` + Retry-After; 502 `VOICE_UPSTREAM`; 504 `VOICE_TIMEOUT` |
| `GET /api/game-runs/{runId}/rounds/{roundId}/audio?accent=` | session | — | `audio/mpeg` | 401; 400; 503; 404 `PRIVATE_NOT_FOUND` |
| `GET /api/learner/personalized-lessons/{id}/exercises/{exerciseId}/audio?accent=` | LEARNER/ADMIN | — | `audio/mpeg` | 401; 503; 404 `PRIVATE_NOT_FOUND` (FILL/CHOICE/không sở hữu/không READY) |

## Types
```ts
// src/core/voice/elevenlabs-voice-policy.ts
export interface CuratedElevenVoice { id; name; subtitle; accent: "american"|"british"|"other"; gender: "female"|"male"|"unknown"; tier: "TOP"|"GOOD"|"OK"; previewUrl: string|null; score: number }
export function rankElevenEnglishVoices(voices, accent: "american"|"british", limit = 8): CuratedElevenVoice[];
export function rankElevenVietnameseVoices(voices, limit = 4): CuratedElevenVoice[];
export function buildCuratedCatalogue(voices): { "en-US"; "en-GB"; vi };

// src/server/voice/elevenlabs.ts
export function resolveElevenLabsConfig(env?): ElevenLabsConfig | null;
export async function getCuratedVoiceCatalogue(config, now?): Promise<CuratedVoiceCatalogue>; // cache 1h
export async function resolveVoiceId(config, { lang, accent?, voiceId? }): Promise<string>;
export async function synthesizeSpeech(config, { text, lang, accent?, voiceId?, speed? }): Promise<{ audio; contentType; voiceId; model; cached }>;
export class ElevenLabsError { code: "not_configured"|"invalid_input"|"rate_limited"|"quota_exceeded"|"unauthorized"|"upstream"|"timeout"; status; retryAfterSeconds? }

// src/server/adaptive-games/service.ts
export async function getAdaptiveGameRoundSpeechText(userId, runId, roundId): Promise<string>; // SPELL only

// src/features/voice/voice-preferences.ts (thêm)
engine: "auto" | "browser"; aiVoices: Partial<Record<"en-US"|"en-GB"|"vi", string>>;
export function setPreferredAiVoice(key, voiceId | undefined);

// src/core/tts
export class ElevenLabsSpeechEngine implements SpeechEngine; // POST /api/voice/tts, cache 40 blob
export class CompositeSpeechEngine implements SpeechEngine; // thử lần lượt
```

## Hằng số
| Hằng | Giá trị |
|---|---|
| `ELEVENLABS_MAX_TEXT_CHARS` | 600 |
| `ELEVENLABS_TIMEOUT_MS` | 20 000 |
| `DEFAULT_OUTPUT_FORMAT` | `mp3_44100_64` |
| voice_settings | stability 0.55, similarity_boost 0.8, style 0, use_speaker_boost true, speed clamp 0.7–1.2 |
| Catalogue TTL | 1 h / instance; audio cache 48 / instance; client blob cache 40 / trang |
| Hidden-answer speed | 0.9 |
