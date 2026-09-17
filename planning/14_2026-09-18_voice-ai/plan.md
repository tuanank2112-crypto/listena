# Plan 14 — Voice AI: giọng đọc chọn lọc, nói để trả lời, chấm phát âm trên server

- STT: 14
- Created: 2026-09-18 (rạng sáng), Asia/Saigon
- Status: LOCAL ACCEPTED (2026-09-18) — type-check 0; eslint 0 lỗi / 28 cảnh báo (baseline); vitest 119 file / 743 test; Playwright 35/35 (voice-ai 3 ca mới); `next build` PASS (build log liệt kê 58 route entries, có /api/voice/pronunciation). CI ⬜, production ⬜ (user quyết commit/deploy).
- SemVer: MINOR (endpoint mới `/api/voice/pronunciation`, trường DTO mới `voiceScript`, event mới `VOICE_PRACTICE`, hành vi giọng đọc đổi). **Không bump version trong lượt này**: `package.json`/`state.json` giữ 0.7.0; đề xuất 0.8.0 khi CI xanh và user duyệt (bậc thang Plan12/13 ghi ở "Quyết định bị thay thế").
- Owner: root (một agent, không worker). Input: yêu cầu user 2026-09-18 ("voice A.I bị lãng quên; cần chọn lọc phát âm chuẩn ngữ pháp, phù hợp repo, chạy production trên Vercel"); não (kernel, index, hot); ADR 0001; mã `src/core/tts`.
- Environments: local (vitest, Playwright DB tạm :3100, `next build`) → CI → Production Vercel (user deploy).

## Bằng chứng khảo sát trước khi làm (2026-09-18 00:00+07)

| Điểm | Thực trạng đo được |
|---|---|
| Giọng tiếng Anh | `WebSpeechEngine` ghim `en-GB`, xếp hạng theo tên chuỗi ("natural/premium"), loại trừ Google; không có danh sách loại trừ giọng novelty (Apple "Bad News", "Zarvox"…). |
| Giọng tiếng Việt | Sidecar VieNeu (Python, loopback) — **không chạy được trên Vercel**; fallback Web Speech. |
| Văn bản đưa vào giọng | Chuỗi thô (`npcReply`, meaning, transcript) → markdown/emoji/IPA/tiếng Việt lẫn trong câu tiếng Anh đều bị đọc. |
| Nói vào (STT) | Không có. `Permissions-Policy: microphone=()` **chặn micro toàn app**. Plan12 ghi STT là non-goal. |
| Nhà cung cấp audio | Vyce `GET /models` (probe 2026-09-18): 5 model text + 1 image, **không có model TTS/STT**. |
| Chấm phát âm | Không có. |

Kết luận: Voice AI trên Vercel chỉ khả thi bằng (a) giọng trình duyệt có **chính sách chọn lọc** + (b) **kịch bản nói do server chuẩn hoá** + (c) STT trình duyệt + (d) chấm điểm tất định trên server. Không phụ thuộc sidecar, không thêm biến môi trường, không tốn phí.

## Nhật ký quyết định

- 2026-09-18 00:05+07: User yêu cầu thêm Voice AI. Root đọc não, khảo sát (bảng trên), probe Vyce. Chốt phạm vi 4 mảng (a)–(d); lập Plan14 dạng SPEC package (MINOR).
- 2026-09-18 00:10+07: **"Chọn lọc phát âm chuẩn ngữ pháp"** được hiện thực bằng hai bất biến: (1) mọi chuỗi vào giọng đi qua `prepareSpokenText` (sạch markdown/emoji/IPA/URL, tách câu, viết hoa + dấu kết câu, mở rộng viết tắt, tách ngôn ngữ theo dấu tiếng Việt); (2) với lượt AI, **server** dựng `voiceScript` (NPC tiếng Anh, RECAST = câu đã sửa đọc chậm, COACH tiếng Việt) và **không bao giờ** đọc `detectedError.actual` (câu sai của học viên).
- 2026-09-18 00:15+07: Chính sách giọng: NEURAL > PREMIUM > SYSTEM > REMOTE(Google); loại trừ tuyệt đối giọng novelty; **accent đúng yêu cầu luôn thắng tier** (chọn en-GB thì không nhận giọng neural en-US). Google không còn bị loại (Android chỉ có Google) — thay thế quyết định ADR 0001.
- 2026-09-18 00:20+07: STT dùng recogniser trình duyệt (Chrome/Edge/Safari), **không** có STT server, audio không rời trình duyệt qua mã của ta. `Permissions-Policy` đổi `microphone=(self)`. Firefox: giữ đường gõ, settings giải thích.
- 2026-09-18 00:25+07: Chấm phát âm = điểm mức từ từ transcript (reuse `assessDictation`, đồng âm tính đúng), ngưỡng GOOD ≥ 0.85 / ALMOST ≥ 0.6. Có `sessionId` thì câu phải nằm trong `voiceScript` NPC/RECAST của phiên (chống tự đúc bằng chứng) và ghi `VOICE_PRACTICE` (giá trị %) vào sổ sự kiện phiên; **vùng cấm**: không ghi `LearningEvidence`, không đụng mastery/planner cho tới khi pilot cho thấy tín hiệu STT đáng tin. Route events công khai từ chối `VOICE_PRACTICE`.
- 2026-09-18 00:40+07: Nghiệm thu local: 119 file / 743 unit test xanh; eslint 0 lỗi; type-check 0; build PASS; Playwright 35/35 (lần 1 fail 2 ca voice vì learner seed còn phiên ACTIVE từ smoke spec → spec tự abandon qua Prisma và xử lý nút "Bắt đầu phiên mới").

## Quyết định bị thay thế

- ADR 0001 "Engine loại trừ Google voice" → **thay bằng** "Google là tier REMOTE, xếp cuối, vẫn dùng khi là giọng tiếng Anh duy nhất" (lý do: Android Chrome chỉ có giọng Google; loại trừ = câm).
- ADR 0001 / `web-speech-engine.ts` "tiếng Anh ghim `en-GB`" → **thay bằng** tuỳ chọn accent của học viên, mặc định `en-US` (`DEFAULT_ENGLISH_ACCENT`), lưu localStorage.
- `voice-selection.ts` "quality fast/high đổi cách xếp hạng" → **thay bằng** luôn chọn giọng tốt nhất theo chính sách; tham số `quality` giữ để tương thích, không còn tác dụng.
- Plan12 00-ARCHITECTURE / Plan13 non-goals "CẤM STT" → **thay bằng** STT trình duyệt trong phạm vi Plan14 (yêu cầu user 2026-09-18). Vẫn CẤM STT server và CẤM dùng STT làm bằng chứng kỹ năng.
- Plan12 bậc thang "0.8.0 = causal planner + eval + live coaching hosted" → **đề xuất** 0.8.0 = Plan14 Voice AI (local + CI); các mốc hosted/pilot của Plan12 dời tiếp (không xoá). User quyết khi bump.

## Work packages + Model Tier

| WP | Owner / tier | Deliverable | Files | Status |
|---|---|---|---|---|
| P140 | root / high | Curated speech: `spoken-text`, `voice-policy`, `voice-script`, `speakLines/speakCurated/speakVoiceScript`, engine dùng chính sách + accent | `src/core/voice/{spoken-text,voice-policy,voice-script}.ts`, `src/core/tts/{speech,voice-selection,web-speech-engine}.ts`, `src/server/learning/dto.ts`, `src/features/learning-session/types.ts` | ✅ local |
| P141 | root / high | Voice input + pronunciation: recogniser wrapper, `scorePronunciation`, service, route, event `VOICE_PRACTICE` | `src/core/voice/{speech-recognition,pronunciation}.ts`, `src/server/voice/pronunciation-service.ts`, `src/app/api/voice/pronunciation/route.ts`, `src/server/validation/learning-session.ts`, `src/server/learning/service.ts` (type), `src/app/api/learning-sessions/[sessionId]/events/route.ts` | ✅ local |
| P142 | root / high | UI: preferences, `VoiceInputButton`, `VoiceSettings`, `RepeatAfterMe`, tích hợp Session Player, curated speak ở lesson/personalized/canvas, `Permissions-Policy` | `src/features/voice/**`, `src/app/learner/session/[sessionId]/session-player.tsx`, `src/app/learner/lessons/[lessonId]/lesson-client.tsx`, `src/app/learner/personalized-lessons/[lessonId]/personalized-lesson-player.tsx`, `src/features/answer-canvas/answer-canvas.tsx`, `src/components/providers.tsx`, `next.config.ts` | ✅ local |
| P143 | root / standard | Docs/não: ADR 0002, README, learning.md, Plan14 specs, brain (kernel/index/hot/roadmap/changelog/project-intro/data-architecture) | `docs/adr/0002-voice-ai.md`, `README.md`, `docs/learning.md`, `planning/14_*`, `brain4agent/**` | ✅ local |
| P144 | root | Nghiệm thu: vitest/type-check/lint/build/Playwright; ledger | — | ✅ local (CI ⬜, production ⬜) |

## Checklist thực thi

- [x] Boot não (`init_brain.js --check` exit 0), đọc kernel/index/hot, probe Vyce catalogue.
- [x] Viết bộ SPEC Plan14 (00, 01, P140–P142, OPERATIONS, TESTING-ACCEPTANCE).
- [x] P140 curated speech + test (spoken-text 10, voice-policy 9, voice-script 5, speech sequence 5, voice-selection 6).
- [x] P141 STT wrapper + pronunciation + service + route + test (recognition 5, pronunciation 6, service 5, route 6).
- [x] P142 UI + tích hợp + test tĩnh (2) + preferences (3); `Permissions-Policy microphone=(self)`.
- [x] P143 docs + não.
- [x] P144 gates local (ledger ở TESTING-ACCEPTANCE).
- [ ] CI xanh trên commit Plan14 (user commit/push).
- [ ] Production: deploy Vercel + smoke thủ công trên Chrome/Edge/Safari + Android (bảng OPERATIONS).

## SPEC router (đọc theo thứ tự)

| Thứ tự | Contract | Phạm vi |
|---|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, bất biến, vùng cấm |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) | Types, endpoint, event, hằng số, mã lỗi |
| 3 | [SPEC-P140-CURATED-SPEECH](specs/SPEC-P140-CURATED-SPEECH.md) | Chuẩn hoá văn bản nói, chính sách giọng, kịch bản lượt AI |
| 4 | [SPEC-P141-VOICE-INPUT-PRONUNCIATION](specs/SPEC-P141-VOICE-INPUT-PRONUNCIATION.md) | STT trình duyệt, chấm phát âm, ghi sổ |
| 5 | [SPEC-P142-UI-INTEGRATION](specs/SPEC-P142-UI-INTEGRATION.md) | Preferences, nút mic, settings, Repeat-after-me, Session Player |
| 6 | [OPERATIONS](specs/OPERATIONS.md) | Vercel, header, smoke thủ công theo trình duyệt, rollback |
| 7 | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) | Ma trận test + ledger + Exit Gates theo môi trường |
