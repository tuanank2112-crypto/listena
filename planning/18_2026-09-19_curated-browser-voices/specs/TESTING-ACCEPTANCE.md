# TESTING & ACCEPTANCE

## 1. Ma trận test

| ID | Tầng | Ca | Kỳ vọng |
|---|---|---|---|
| T1 | unit `browser-voice-catalog.test.ts` | `normaliseVoiceName` với 8 chuỗi ở SPEC-P180 §3 | đúng từng khoá |
| T2 | unit | `lookupCuratedVoice` cho Edge/Apple/Google/SAPI | trả đúng mục; tên lạ ⇒ `undefined` |
| T3 | unit | Tính toàn vẹn catalog: key duy nhất, alias không trùng, `0 ≤ listenability ≤ 99`, không mục nào nằm trong danh sách novelty | pass |
| T4 | unit `voice-policy.test.ts` | Máy Windows/Edge giả lập (Andrew, Aria, Ava, Emma Natural + Zira + Google US English) | `chooseEnglishVoice` trả **Ava** (trước plan: Andrew) |
| T5 | unit | Bất biến Plan14: giọng đúng accent luôn trước giọng accent khác dù `quality` thấp hơn | pass |
| T6 | unit | Bất biến Plan14: Google (REMOTE) luôn sau mọi giọng local cùng accent, kể cả SAPI cũ điểm thấp | pass |
| T7 | unit | Giọng novelty (`Bad News`, `Zarvox`) bị loại khỏi `rankEnglishVoices` | pass |
| T8 | unit | Giọng ngoài catalog vẫn được xếp hạng (`quality = tier*100`) | pass |
| T9 | unit `voice-preferences.test.ts` | Payload cũ (không có `browserVoices`) | `{}`, các trường khác giữ nguyên |
| T10 | unit | `setPreferredBrowserVoice("en-US", uri)` rồi `("en-US", undefined)` | ghim rồi xoá; `en-GB` không bị ảnh hưởng |
| T11 | unit | Sanitize: `""`, chuỗi >200 ký tự, số, `null` | bị loại, không ném |
| T12 | unit `web-speech-engine` (hoặc `voice-selection`) | Có `getPreferredVoiceURI` trả URI tồn tại | utterance dùng đúng giọng đó |
| T13 | unit | Giọng ghim không tồn tại | rơi về chính sách, không ném |
| T14 | unit | Đổi preference giữa hai lần `speak` | lần hai dùng giọng mới (chứng minh cache key có preferredURI) |
| T15 | unit `speech.test.ts` | `speakWithBrowserVoice` khi engine AI đã đăng ký | engine AI **không** được gọi; engine fallback được gọi đúng `voiceURI` |
| T16 | component `voice-settings` | Render với `getVoices()` giả lập | có mục "Tự động", ≤6 mục, mỗi mục có nút `Nghe thử …` |
| T17 | E2E | Trang settings mở được, không lỗi console, app không câm khi `enabled:false` | pass |
| T18 | E2E | `/learner/settings` mở được **không cần bắt đầu Mission**; chọn giọng rồi F5 vẫn giữ | pass |
| T19 | E2E | Ở viewport 360px, `scrollWidth <= clientWidth` (ghim F-01) | pass |

**CẤM** nghiệm thu bằng riêng unit test của hàm thuần (luật kernel): T16/T17 + smoke thủ công ở OPERATIONS §2.4 là bằng chứng tầng sản phẩm.

## 2. Exit Gates

| Gate | Lệnh | local | server/prod |
|---|---|---|---|
| G1 type-check | `npm run type-check` | ✅ 0 lỗi | — |
| G2 lint | `npx eslint .` | ✅ 0 lỗi / 28 cảnh báo | — |
| G3 unit | `npx vitest run` | ✅ 129 file / 820 test | — |
| G4 build | `npm run build` | ✅ 66 dòng route | — |
| G5 E2E | `npm run test:e2e` | ✅ 40/40 | — |
| G6 brain | `init_brain.js --check` exit 0 | ✅ | — |
| G7 smoke Edge + Chrome (OPERATIONS §2.4) | thủ công | ⬜ | ⬜ chỉ user làm được; **không nghiệm thu được trên production** vì chưa ai đăng nhập được (mail chưa cấu hình, rào cản Plan09 có trước) |
| G8 CI xanh sau push | GitHub Actions | — | ⬜ chưa kiểm (`gh` chưa đăng nhập trên máy này) |

Kế hoạch **chỉ được đóng** khi G1–G7 local ✅ **và** G7/G8 môi trường thật ✅.

## 2b. Số đo thật đã ghi (2026-09-19)

| Đo | Trước Plan18 | Sau Plan18 |
|---|---|---|
| type-check | 0 lỗi | 0 lỗi |
| eslint | 0 lỗi / 28 cảnh báo | 0 lỗi / 28 cảnh báo |
| vitest | 126 file / 779 test | **129 file / 820 test** |
| build | PASS | PASS, 66 dòng route |
| Playwright | 38/38 | **40/40** |
| T4 `chooseEnglishVoice` trên máy Windows/Edge giả lập | `Microsoft Andrew Online (Natural)` | **`Microsoft Ava Online (Natural)`** |

G1–G6 ✅. Deploy production đã chạy 2026-09-19: `https://listena-qm16tv2ln-n-listen-ai.vercel.app` READY, alias https://listena.vercel.app trả 200 với `Permissions-Policy: microphone=(self)`. G7 và G8 vẫn ⬜: smoke phải do user mở Edge/Chrome thật, và production hiện **không thể đăng nhập** (mail chưa cấu hình) nên picker chỉ nghiệm thu được ở local + Playwright.

## 3. Bằng chứng phải ghi lại (số thật, không chỉ "xanh")

- Số lỗi type-check; số lỗi/cảnh báo eslint; số file/test vitest **trước và sau**; số route build; số ca Playwright.
- Với T4: ghi rõ tên giọng trả về **trước** và **sau** thay đổi.
- Với G7: ghi trình duyệt, tên giọng nghe được, và ảnh/ghi chú xác nhận đổi giọng có tác dụng ngay.
