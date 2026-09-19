---
name: english-voices
description: Giọng tiếng Anh MIỄN PHÍ có sẵn trên máy/trình duyệt cho ListenAI — catalog giọng đã thẩm định, xếp hạng "dễ nghe", học viên tự chọn giọng, hướng dẫn cài thêm giọng Natural. Dùng khi việc chạm tới chất lượng giọng đọc, giọng nghe dở/máy móc, chọn giọng trong Settings, voice-policy, browser-voice-catalog, hoặc khi KHÔNG có API key TTS.
license: theo giấy phép của repo
compatibility: Đọc offline được. Không cần API key, không cần mạng, không thêm dependency. Giọng thật do hệ điều hành/trình duyệt của người dùng cung cấp.
metadata: {"spec": "planning/18_2026-09-19_curated-browser-voices/specs/SPEC-P180-CATALOG.md", "spec_ui": "planning/18_2026-09-19_curated-browser-voices/specs/SPEC-P181-PICKER.md", "adr": "docs/adr/0004-curated-browser-voices.md", "source_of_truth": "src/core/voice/browser-voice-catalog.ts"}
---

# English Voices (miễn phí, không API key) — skill của ListenAI

Skill này lo **đường tiếng không tốn tiền**: giọng đã cài sẵn trong hệ điều hành và trình duyệt của học viên. Nó KHÔNG gọi dịch vụ nào, KHÔNG cần key. Giọng AI trả phí là việc của skill [`elevenlabs-voice`](../elevenlabs-voice/SKILL.md).

## Thứ tự đọc

1. File này (luật + công thức).
2. [references/voice-catalog.md](references/voice-catalog.md) — giọng nào hay, vì sao, ở đâu có.
3. [references/install-voices.md](references/install-voices.md) — cài thêm giọng theo từng hệ điều hành (nội dung để trả lời người dùng).
4. Nguồn quyết định: `planning/18_2026-09-19_curated-browser-voices/specs/` → `SPEC-P180-CATALOG.md` (xếp hạng), `SPEC-P181-PICKER.md` (preference + UI), `OPERATIONS.md` (cài đặt/smoke/rollback).
5. Nền cũ: `docs/adr/0002-voice-ai.md` (chính sách giọng Plan14).

## Bản đồ mã

| Việc | File |
|---|---|
| Catalog giọng + chuẩn hoá tên | `src/core/voice/browser-voice-catalog.ts` |
| Xếp hạng, tier, loại giọng novelty | `src/core/voice/voice-policy.ts` |
| Chọn giọng lúc phát | `src/core/tts/web-speech-engine.ts`, `src/core/tts/voice-selection.ts` |
| Nghe thử ép đúng giọng hệ thống | `speakWithBrowserVoice` trong `src/core/tts/speech.ts` |
| Ghim giọng theo accent | `src/features/voice/voice-preferences.ts` (`browserVoices`, `setPreferredBrowserVoice`) |
| UI chọn giọng | `src/features/voice/voice-settings.tsx` (`BrowserVoicePicker`, `buildBrowserVoiceOptions`) |
| Đăng ký engine | `src/components/providers.tsx` |

## Luật của repo

| # | BẮT BUỘC / CẤM | Lý do |
|---|---|---|
| E1 | Điểm `listenability` **CẤM** ≥ 100; một bậc tier đáng giá 100. Catalog chỉ xếp thứ tự **bên trong** tier. | Giữ bất biến Plan14 (SPEC-P180 C2). Bỏ luật này thì trên Android "Google US English" sẽ lật ngược giọng neural của máy. |
| E2 | Khớp catalog theo **tên đã chuẩn hoá** (`normaliseVoiceName`), **CẤM** ghi `voiceURI` vào catalog. | Cùng một giọng có URI khác nhau giữa Chrome/Edge/Safari/Firefox (SPEC-P180 C3). |
| E3 | Catalog **chỉ cộng điểm, không lọc**. Máy chỉ có giọng lạ vẫn phải phát được. | Không để app câm (SPEC-P180 C1). |
| E4 | **CẤM** đưa giọng novelty (`Bad News`, `Zarvox`, `Whisper`…) vào catalog; `EXCLUDED_VOICE_NAMES` vẫn thắng. | Không bao giờ làm mẫu phát âm. |
| E5 | Nút nghe thử giọng hệ thống **BẮT BUỘC** dùng `speakWithBrowserVoice`, **CẤM** `speakCurated`. | Có key ElevenLabs thì `speakCurated` sẽ phát giọng AI, học viên nghe nhầm giọng (SPEC-P181 §4). |
| E6 | Khoá `voiceCache` trong `WebSpeechEngine` **BẮT BUỘC** chứa cả giọng đã ghim. | Thiếu thì đổi giọng trong Settings không ăn cho tới khi F5 (01-CONTRACTS §5). |
| E7 | Giọng học viên ghim chỉ nằm ở `localStorage` (`listena.voice.v1`). **CẤM** gửi server, **CẤM** ghi `LearningEvidence`/mastery/planner. | Vùng cấm Plan14/15: nghe không sinh bằng chứng học tập. |
| E8 | **CẤM** dùng chung `aiVoices` cho giọng trình duyệt: sanitiser của `aiVoices` chỉ nhận ID ElevenLabs `[A-Za-z0-9]{8,64}` nên sẽ nuốt sạch `voiceURI` có dấu cách. | SPEC-P181 §2. |
| E9 | **CẤM** đổi khoá `listena.voice.v1` khi thêm trường mới; payload cũ phải sống sót (test ghim điều này). | Đổi khoá = xoá sạch preference của học viên đang dùng. |
| E10 | **CẤM** thêm dependency, sidecar, model tải về hay dịch vụ trả tiền trong phạm vi skill này. Muốn vậy ⇒ MINOR ⇒ mở plan có bộ SPEC. | Luật khung AGENTS.md; vùng cấm Plan18. |

## Công thức

### A. Thêm một giọng vào catalog
1. Lấy **tên thô thật** từ máy có giọng đó (công thức C), đừng đoán.
2. Sửa **bảng SPEC-P180 §4 trước**, ghi rõ `listenability` và lý do (E1).
3. Sửa `CURATED_BROWSER_VOICES` trong `src/core/voice/browser-voice-catalog.ts`; nếu tên thô chuẩn hoá ra khoá khác ⇒ thêm vào `aliases`, đừng tạo mục trùng.
4. Thêm case vào `browser-voice-catalog.test.ts` (chuẩn hoá + tra cứu) và, nếu đổi thứ hạng, vào `voice-policy.test.ts`.
5. Chạy đủ 5 gate: `npm run type-check`, `npx eslint .`, `npx vitest run`, `npm run build`, `npm run test:e2e`.

### B. "Máy học viên nghe dở"
Chẩn đoán theo bảng dưới; đừng vội sửa mã.

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| Giọng như robot, ngắt quãng | Máy chỉ có SAPI đời cũ (David/Zira/Mark/Hazel/George) | [install-voices.md](references/install-voices.md) §1 — cài giọng Natural, hoặc mở bằng Edge |
| Không có giọng nào trong danh sách | Chrome nạp giọng bất đồng bộ / Linux thiếu `speech-dispatcher` | Chờ sự kiện `voiceschanged` (UI đã xử lý); Linux xem install-voices §5 |
| Giọng Natural biến mất khi mất mạng | Giọng "Online (Natural)" của Edge cần Internet | Cài bản Natural **local** của Windows, hoặc chấp nhận rơi về giọng local |
| Nghe thử ra giọng khác giọng đang chọn | Gọi nhầm `speakCurated` | E5 |
| Đổi giọng phải F5 mới ăn | Thiếu giọng ghim trong khoá `voiceCache` | E6 |
| Giọng đúng accent nhưng vẫn bị giọng accent khác chiếm | Không thể xảy ra nếu `accentScore` còn nguyên — kiểm test "keeps the requested accent ahead" | Không sửa điểm số để chữa; sửa `accentScore` là đổi kiến trúc ⇒ cần plan |

### C. Xem máy này có giọng gì
Dán vào console trình duyệt của máy cần kiểm (không cần đăng nhập):

```js
speechSynthesis.getVoices()
  .filter(v => v.lang.startsWith("en"))
  .map(v => `${v.name} | ${v.lang} | ${v.localService ? "local" : "network"}`)
  .join("\n");
```

Danh sách rỗng ⇒ gọi lại sau sự kiện `voiceschanged` (Chrome nạp chậm), đừng kết luận máy không có giọng.

### D. Trả lời người dùng "làm sao nghe hay hơn?"
Theo thứ tự rẻ → đắt: (1) mở app bằng **Microsoft Edge** (có ngay giọng Natural, không cài gì); (2) cài giọng Natural **local** của Windows/macOS ([install-voices.md](references/install-voices.md)); (3) vào Settings giọng, chọn giọng trong danh sách và bấm nghe thử; (4) chỉ khi vẫn chưa đủ mới bàn tới giọng AI trả phí (`elevenlabs-voice`).

## Khác với skill `elevenlabs-voice`

| | `english-voices` (skill này) | `elevenlabs-voice` |
|---|---|---|
| Nguồn giọng | Hệ điều hành / trình duyệt của học viên | API ElevenLabs |
| Chi phí | 0 | Theo ký tự |
| Key | Không | `ELEVENLABS_API_KEY` (chỉ server) |
| Chạy khi mất mạng | Có, với giọng local | Không |
| Vai trò trong chuỗi | Luôn là đường cuối, không bao giờ được bỏ | Dẫn đầu khi server có key và học viên để `engine=auto` |
| Nguồn chân lý danh sách giọng | `src/core/voice/browser-voice-catalog.ts` | `GET /v2/voices` của tài khoản + `elevenlabs-voice-policy.ts` |
