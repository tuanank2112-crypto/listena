# 01 — Contracts

Mọi chữ ký dưới đây là **bắt buộc đúng nguyên văn**. Đổi chữ ký ⇒ phải sửa spec trước.

## 1. `src/core/voice/browser-voice-catalog.ts` (MỚI)

```ts
export interface CuratedBrowserVoice {
  /** Tên đã chuẩn hoá, duy nhất trong catalog. */
  key: string;
  /** Tên chuẩn hoá khác cùng trỏ về mục này (biến thể giữa các OS/trình duyệt). */
  aliases?: string[];
  /** Nhãn hiển thị cho học viên. */
  label: string;
  /** Mô tả tiếng Việt, một câu. */
  note: string;
  accent: EnglishAccent;
  gender: "female" | "male";
  /** Nguồn giọng, để hiển thị và để hướng dẫn cài. */
  platform: "Microsoft Natural" | "Microsoft (cũ)" | "Apple" | "Google";
  /** Độ dễ nghe cho học viên A1–A2, 0..99. CHỈ so sánh trong cùng tier. */
  listenability: number;
}

/** Chuẩn hoá tên giọng của Web Speech về khoá catalog. Không bao giờ ném lỗi. */
export function normaliseVoiceName(name: string): string;

/** Tra catalog theo tên thô của `SpeechSynthesisVoice`. `undefined` = không có trong catalog. */
export function lookupCuratedVoice(name: string): CuratedBrowserVoice | undefined;

/** Toàn bộ catalog, chỉ đọc. */
export const CURATED_BROWSER_VOICES: readonly CuratedBrowserVoice[];
```

## 2. `src/core/voice/voice-policy.ts` (SỬA)

```ts
export interface VoiceChoice<V extends CandidateVoice = CandidateVoice> {
  voice: V;
  tier: VoiceTier;
  accentMatched: boolean;
  /** MỚI: mục catalog khớp, nếu có. */
  curated?: CuratedBrowserVoice;
  /** MỚI: điểm xếp hạng tổng = TIER_RANK*100 + listenability. */
  quality: number;
}

/** MỚI: điểm dùng để sắp xếp; export để test và UI đọc cùng một công thức. */
export function voiceQualityScore(voice: CandidateVoice): number;
```

`rankEnglishVoices` và `chooseEnglishVoice` giữ nguyên chữ ký, chỉ đổi thứ tự sắp xếp và trường trả về.

## 3. `src/features/voice/voice-preferences.ts` (SỬA)

```ts
export interface VoicePreferences {
  // …giữ nguyên các trường cũ…
  /** MỚI: giọng trình duyệt học viên tự chọn cho từng accent; thiếu = để chính sách quyết. */
  browserVoices: Partial<Record<EnglishAccent, string>>;
}

/** MỚI. `voiceURI === undefined` ⇒ xoá lựa chọn, quay về "Tự động". */
export function setPreferredBrowserVoice(accent: EnglishAccent, voiceURI: string | undefined): void;
```

- Khoá lưu trữ **giữ nguyên** `listena.voice.v1`. Payload cũ không có `browserVoices` ⇒ `{}` (không được ném, không được reset các trường khác).
- Sanitize: chuỗi, `1..200` ký tự sau `trim()`; khác ⇒ bỏ qua khoá đó.

## 4. `src/core/tts/speech.ts` (THÊM)

```ts
export interface SpeakWithBrowserVoiceOptions {
  text: string;
  lang: SpeechLanguage;
  /** `voiceURI` hoặc `name` của giọng hệ thống cần ép. */
  voiceURI?: string;
  rate?: number;
}

/** Phát bằng engine trình duyệt, bỏ qua engine AI. Dùng cho nút nghe thử. */
export function speakWithBrowserVoice(options: SpeakWithBrowserVoiceOptions): Promise<SpeakResult>;
```

Hành vi: huỷ mọi phát âm đang chạy (như `speak`), bump `sequenceToken`, gọi thẳng engine fallback của ngôn ngữ. Không engine ⇒ `{ ok:false, status:"unavailable" }`.

## 5. `src/core/tts/web-speech-engine.ts` (SỬA)

```ts
export interface WebSpeechEngineOptions {
  getAccent?: () => EnglishAccent;
  /** MỚI: giọng học viên đã ghim cho accent hiện tại. */
  getPreferredVoiceURI?: (accent: EnglishAccent) => string | undefined;
}
```

Thứ tự chọn giọng trong `selectVoice`: (1) `options.voice` khớp `name`/`voiceURI`; (2) `getPreferredVoiceURI(accent)` khớp `name`/`voiceURI` — chỉ cho `lang` bắt đầu bằng `en`; (3) `selectSystemVoice`. Khoá cache **phải** gồm cả giá trị (2), nếu không đổi giọng trong Settings sẽ không có tác dụng đến khi tải lại trang.

## 6. Bảng lỗi & hành vi bắt buộc của caller

| Tình huống | Trả về | Caller phải làm |
|---|---|---|
| Không có `speechSynthesis` (SSR, trình duyệt cũ) | `speakWithBrowserVoice` → `{ok:false,status:"unavailable"}` | Ẩn khu vực chọn giọng, hiện câu "Trình duyệt này không có giọng đọc." KHÔNG ném. |
| `getVoices()` rỗng lúc mount (Chrome nạp chậm) | Danh sách rỗng | Hiện trạng thái chờ và nghe sự kiện `voiceschanged`; KHÔNG kết luận "máy không có giọng". |
| Giọng đã ghim không còn tồn tại (gỡ giọng, đổi máy) | `selectVoice` bỏ qua, rơi về chính sách | UI hiện "Giọng đã chọn không còn trên thiết bị" và hiển thị mục "Tự động" đang hoạt động. KHÔNG tự xoá preference (học viên có thể cắm lại giọng). |
| `localStorage` bị chặn | `setPreferredBrowserVoice` vẫn áp dụng trong phiên | Không hiện lỗi. |
| Giọng phát lỗi `interrupted`/`canceled` | `{ok:false,status:"cancelled"}` | KHÔNG fallback, KHÔNG báo lỗi (luật Plan14). |
