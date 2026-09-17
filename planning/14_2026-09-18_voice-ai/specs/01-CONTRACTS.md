# 01 — Contracts Plan14

## Version

- `package.json` / `state.current_version`: giữ **0.7.0**. Đề xuất **0.8.0** sau khi CI xanh và user duyệt (plan.md §Quyết định bị thay thế).

## Types (nguồn chân lý: mã)

```ts
// src/core/voice/spoken-text.ts
export type SpokenLang = "en" | "vi";
export interface SpokenLine { lang: SpokenLang; text: string }
export interface SpokenScript { lines: SpokenLine[]; dropped: string[] }
export const MAX_SPOKEN_LINE_CHARS = 240;
export function detectSpokenLang(sentence: string, fallback: SpokenLang): SpokenLang;
export function prepareSpokenText(text: string, lang: SpokenLang): SpokenScript;

// src/core/voice/voice-policy.ts
export type EnglishAccent = "en-US" | "en-GB";
export type VoiceTier = "NEURAL" | "PREMIUM" | "SYSTEM" | "REMOTE";
export interface VoiceChoice<V> { voice: V; tier: VoiceTier; accentMatched: boolean }
export function rankEnglishVoices<V extends CandidateVoice>(voices: V[], accent: EnglishAccent): VoiceChoice<V>[];
export function chooseEnglishVoice<V>(voices: V[], accent: EnglishAccent): VoiceChoice<V> | undefined;
export function chooseVietnameseVoice<V>(voices: V[]): V | undefined;
export const DEFAULT_ENGLISH_ACCENT: EnglishAccent = "en-US";

// src/core/voice/voice-script.ts
export type VoiceLineRole = "NPC" | "RECAST" | "COACH";
export interface VoiceLine { role: VoiceLineRole; lang: SpokenLang; text: string; rate: number }
export interface VoiceScript { version: "v1"; lines: VoiceLine[] }
export const NPC_RATE = 0.95, RECAST_RATE = 0.82, COACH_RATE = 1;
export function buildTurnVoiceScript(content: unknown): VoiceScript | null;
export function repeatableLines(script?: VoiceScript | null): VoiceLine[]; // en + NPC|RECAST

// src/core/voice/pronunciation.ts
export type PronunciationWordStatus = "MATCH" | "CLOSE" | "MISSED" | "EXTRA";
export interface PronunciationResult {
  score: number; verdict: "GOOD" | "ALMOST" | "RETRY";
  words: Array<{ expected: string | null; heard: string | null; status: PronunciationWordStatus }>;
  retryWords: string[]; feedbackVi: string; recognitionConfidence: number | null;
}
export function scorePronunciation(expected: string, transcript: string, recognitionConfidence?: number | null): PronunciationResult;

// src/core/tts/speech.ts (thêm)
export function speakLines(lines: SpeakLineInput[], options?): Promise<SpeakResult>;
export function speakCurated(options: { text: string; lang: SpeechLanguage; rate?: number; voice?: string }): Promise<SpeakResult>;
export function speakVoiceScript(script: VoiceScript, options?: { includeCoach?: boolean; rateScale?: number }): Promise<SpeakResult>;

// src/features/learning-session/types.ts (additive)
export interface SessionTurn { /* … */ voiceScript?: VoiceScript | null } // chỉ AI turns
```

## Endpoint mới

`POST /api/voice/pronunciation` — `runtime = "nodejs"`, auth bắt buộc, role LEARNER|ADMIN, `Cache-Control: private, no-store`.

Request (Zod `PronunciationRequestSchema`):

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `clientAttemptId` | uuid | bắt buộc; idempotency key khi ghi phiên |
| `expected` | string | 1..300, trim |
| `transcript` | string | 0..400, trim, mặc định "" (rỗng = không nghe thấy) |
| `recognitionConfidence` | number | 0..1, tuỳ chọn, chỉ echo |
| `sessionId` | uuid | tuỳ chọn |

Response 200: `{ result: PronunciationResult, recorded: boolean }`.

| Mã | HTTP | Khi nào | Caller phải |
|---|---|---|---|
| — `Unauthorized` | 401 | chưa đăng nhập | chuyển login |
| `ROLE_FORBIDDEN` | 403 | TEACHER | ẩn tính năng |
| `INVALID_INPUT` | 400 | body/JSON sai | sửa client |
| `EXPECTED_NOT_IN_SESSION` | 400 | có `sessionId` nhưng câu không thuộc NPC/RECAST của phiên | không retry; báo lỗi |
| `SESSION_NOT_FOUND` | 404 | phiên không tồn tại/không thuộc user | không retry |
| `SESSION_CONFLICT` | 409 | phiên không ACTIVE | hiện điểm, không lưu |
| `EVENT_LIMIT` | 429 + Retry-After | > 200 sự kiện | hiện điểm, không lưu |
| `INTERNAL_ERROR`/DB | 500/503 | lỗi hạ tầng | thông báo chung |

## Event mới

`LearningEventSchema.type` thêm `"VOICE_PRACTICE"`; `value` = `round(score*100)` (0..100). Row: `LearningTurn` actor `SYSTEM`, type `RESULT`, `contentJson = {"event":"VOICE_PRACTICE","value":N}`, `clientTurnId = voice-<clientAttemptId>` (đi qua `getEventClientTurnId`). Route `/api/learning-sessions/[id]/events` trả 400 nếu nhận `VOICE_PRACTICE`.

## Hằng số

| Hằng | Giá trị | File |
|---|---|---|
| `MAX_SPOKEN_LINE_CHARS` | 240 | spoken-text.ts |
| `PRONUNCIATION_GOOD_THRESHOLD` / `ALMOST` | 0.85 / 0.6 | pronunciation.ts |
| `MAX_PRONUNCIATION_TEXT_CHARS` | 300 | pronunciation.ts |
| `DEFAULT_MAX_LISTEN_MS` | 15 000 | speech-recognition.ts |
| `VOICE_PREFERENCES_STORAGE_KEY` | `listena.voice.v1` | voice-preferences.ts |
| Rate options | 0.8 / 0.92 / 1 (mặc định 0.92) | voice-preferences.ts |
| Permissions-Policy | `camera=(), microphone=(self), geolocation=()` | next.config.ts |

## Không đổi

Schema Prisma, migrations, `TutorTurnOutputSchema`, prompt tutor, CSP, biến môi trường, VieNeu route.
