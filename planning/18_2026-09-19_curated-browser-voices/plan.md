# Plan 18 — Giọng Anh miễn phí nghe hay hơn (catalog + học viên tự chọn), đóng gói thành skill

- STT: 18
- Created: 2026-09-19, Asia/Saigon
- Status: COMMITTED + DEPLOYED 2026-09-19 — 5 gate local xanh 100%; commit `dd6a69f`, production Vercel READY. Còn mở: smoke thủ công Edge/Chrome (chỉ user làm được) và CI (máy này chưa `gh auth login`).
- SemVer: **MINOR** (thêm năng lực người dùng thấy được + preference mới) ⇒ bắt buộc đủ bộ SPEC (luật AGENTS.md §2). Version đề xuất 0.8.0 khi mọi gate xanh — **user quyết**, không tự bump.
- Owner: root (một agent, auto-mode).
- Input user 2026-09-19: *"thêm các voice khác nghe thanh thoát hơn, dễ nghe hơn mà chuẩn tiếng anh hơn… tôi cần voices đó là các skills chứ k phải dùng api key của elevenlab"*.
- Chốt qua hỏi-đáp 2026-09-19: (1) nguồn giọng = **giọng neural miễn phí của máy/trình duyệt** (Microsoft Natural, Apple Premium/Siri, Google), KHÔNG key; (2) phạm vi = **skill + code + UI chọn giọng**.
- Đọc trước: `brain4agent/memory-distill.txt` → `index.md` → `planning/16_.../plan.md` (WP4/WP5 còn mở) → `docs/adr/0002-voice-ai.md`, `0003-elevenlabs-voice.md` → `specs/00-ARCHITECTURE.md` của plan này.

## Diễn giải yêu cầu (chốt)

| Câu của user | Nghĩa thực thi |
|---|---|
| "nghe thanh thoát hơn, dễ nghe hơn, chuẩn tiếng Anh hơn" | Giọng đang phát là **giọng đầu tiên chính sách Plan14 chọn được**, không ai kiểm chứng nó dễ nghe. Cần **catalog giọng đã thẩm định** + điểm *listenability* để xếp hạng trong cùng tier, và cho học viên **tự chọn + nghe thử**. |
| "thêm các voice khác" | Hiện học viên KHÔNG có ô chọn giọng trình duyệt (picker chỉ có cho giọng ElevenLabs và đang rỗng vì không key) ⇒ thêm picker giọng trình duyệt trong Settings. |
| "là các skills chứ k phải api key elevenlab" | Không thêm/không cần `ELEVENLABS_API_KEY`. Tri thức "giọng nào hay, cài ở đâu, thêm giọng mới thế nào" đóng gói thành skill `english-voices` (`.agents/skills/` canonical + shim `.claude/skills/`), cùng mẫu với Plan17. |

## Nhật ký quyết định

- **2026-09-19 D1** — Nguồn giọng: giọng neural miễn phí sẵn có trên thiết bị/trình duyệt. Lý do: chạy được cả trên Vercel production, không key, không sidecar, không tải model. *(User chọn.)*
- **2026-09-19 D2** — Phạm vi MINOR: sửa `voice-policy`, thêm catalog, thêm preference + UI picker, viết skill. *(User chọn.)*
- **2026-09-19 D3** — Điểm catalog KHÔNG được vượt tier. Công thức `quality = TIER_RANK*100 + listenability(0..99)`. Lý do: giữ bất biến Plan14 (Google REMOTE luôn cuối), chỉ tinh chỉnh **trong** một tier. Nếu để catalog vượt tier thì trên Android "Google US English" (có trong catalog) sẽ lật ngược giọng neural của máy.
- **2026-09-19 D4** — Không đụng giọng tiếng Việt trong đợt này. Yêu cầu của user là "chuẩn tiếng Anh hơn"; mở rộng vi là phạm vi khác.
- **2026-09-19 D5** — Preview trong Settings phải phát **đúng giọng trình duyệt được chọn**, không đi qua chuỗi engine AI ⇒ thêm entry point `speakWithBrowserVoice` dùng thẳng engine fallback.
- **2026-09-19 D6 (sau demo local)** — Thêm trang `/learner/settings` và mục "Giọng nói" trong điều hướng. Lý do: picker chỉ nằm trong session player, muốn đổi giọng phải bắt đầu một Mission (tốn một lượt AI), trong khi giọng đó dùng ở mọi màn hình. Giữ nguyên picker trong session player. *(User yêu cầu sau khi xem demo.)*
- **2026-09-19 D7** — `<fieldset>` phải có `min-w-0`. Đo được tràn ngang 178px ở bề rộng 360px vì `fieldset` mặc định `min-inline-size: min-content`. Ghim bằng test E2E đo `scrollWidth`.
- **Quyết định bị thay thế:** *(chưa có)* — Plan14 "chính sách luôn trả giọng tốt nhất, học viên không cần chọn" nay được **bổ sung** (không xoá): chính sách vẫn là mặc định, học viên được phép ghi đè. Thứ tự xếp hạng của Plan14 (accent → tier → default → local) giữ nguyên, chỉ chèn thêm listenability **trong** tier.

## Vùng cấm (đã cân nhắc và quyết định KHÔNG làm)

- CẤM thêm dependency, sidecar, model tải về, API key hay endpoint mới. Đợt này **không có** thay đổi DB/route/server.
- CẤM hard-code voiceURI vào logic chọn giọng (catalog khớp theo **tên đã chuẩn hoá**, xem SPEC-P180 §3) — voiceURI khác nhau giữa Chrome/Edge/Safari/Firefox trên cùng một giọng.
- CẤM loại bỏ giọng Google/REMOTE khỏi bảng xếp hạng (trên nhiều máy Android đó là giọng Anh duy nhất — quyết định của Plan14, giữ nguyên).
- CẤM coi việc học viên chọn giọng là dữ liệu học tập: không gửi server, không ghi `LearningEvidence`/mastery/planner (vùng cấm Plan14/15). Preference chỉ nằm ở `localStorage`.
- CẤM đọc thành tiếng đáp án ẩn hay `detectedError.actual` ở đường preview (R5 skill `elevenlabs-voice` vẫn áp dụng).
- CẤM sửa đường ElevenLabs hiện có: có key thì giọng AI vẫn dẫn đầu; plan này chỉ làm tốt hơn đường **không key**.
- Giữ nguyên ngoài commit: `foo`, `test.xlsx`, `prisma/dev.db.bak-plan10`, file ký tự đặc biệt, `eval/report.md`.

## Work packages

| WP | Việc | Tier | Bằng chứng | Trạng thái |
|---|---|---|---|---|
| WP0 | Bước 0 `init_brain.js --check` | — | exit 0, "NÃO ĐÃ OK" (2026-09-19) | ✅ |
| WP1 | Catalog giọng + điểm listenability (`src/core/voice/browser-voice-catalog.ts`) + test | root | SPEC-P180 | ✅ |
| WP2 | `voice-policy.ts` dùng catalog; `rankEnglishVoices` trả `listenability`/`catalog`; test bất biến Plan14 không đổi | root | SPEC-P180 | ✅ |
| WP3 | Preference `browserVoices` + `speakWithBrowserVoice` + `WebSpeechEngine.getPreferredVoiceURI` + providers | root | SPEC-P181 | ✅ |
| WP4 | UI picker "Giọng tiếng Anh trên thiết bị này" trong `voice-settings.tsx` (nghe thử từng giọng, nhãn tiếng Việt, gợi ý cài thêm giọng) | root | SPEC-P181 | ✅ |
| WP5 | Skill `english-voices` (`.agents/skills/english-voices/` + shim `.claude/skills/`) | root | SPEC-P182 | ✅ |
| WP6 | 5 gate local + ghi số đo thật | root | TESTING-ACCEPTANCE | ✅ |
| WP7 | Đồng bộ não + ADR 0004 + `index.md`/`roadmap`/`changelog` | root | diff + `--check` exit 0 | ✅ |
| WP9 | Demo local (DB tạm, server production :3101) + ảnh Playwright | root | 4 ảnh; phát hiện 2 lỗi UI | ✅ |
| WP10 | Trang `/learner/settings` + nav + sửa tràn ngang (SPEC-P183) | root | SPEC-P183; E2E voice 5/5 | ✅ |
| WP8 | Commit/push/deploy | — | commit `dd6a69f` (+ `2f55862` cho Plan17), push `origin/codex/vercel-turso-migration`, deploy production `https://listena-qm16tv2ln-n-listen-ai.vercel.app`, alias https://listena.vercel.app trả 200 | ✅ |

## Checklist thực thi

1. [x] WP1 catalog + test đỏ→xanh
2. [x] WP2 policy + test bất biến cũ vẫn xanh
3. [x] WP3 preference/engine/providers
4. [x] WP4 UI + nghe thử
5. [x] WP5 skill + shim ≤10 dòng
6. [x] WP6 `npm run type-check` → `npx eslint .` → `npx vitest run` → `npm run build` → `npm run test:e2e`
7. [x] WP7 não + ADR
8. [x] WP8 commit + push + deploy (user cho phép)
9. [x] WP9 demo local cho user duyệt
10. [x] WP10 trang Giọng nói + sửa tràn ngang

## Bảng trỏ SPEC

| File | Nội dung |
|---|---|
| [specs/00-ARCHITECTURE.md](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, bất biến, thứ tự đọc |
| [specs/01-CONTRACTS.md](specs/01-CONTRACTS.md) | Chữ ký hàm, kiểu dữ liệu, khoá lưu trữ |
| [specs/SPEC-P180-CATALOG.md](specs/SPEC-P180-CATALOG.md) | Catalog giọng + công thức xếp hạng |
| [specs/SPEC-P181-PICKER.md](specs/SPEC-P181-PICKER.md) | Preference, engine, UI chọn/nghe thử |
| [specs/SPEC-P182-SKILL.md](specs/SPEC-P182-SKILL.md) | Skill `english-voices` |
| [specs/SPEC-P183-SETTINGS-PAGE.md](specs/SPEC-P183-SETTINGS-PAGE.md) | Trang Giọng nói ngoài Mission + lỗi tràn ngang F-01 |
| [specs/OPERATIONS.md](specs/OPERATIONS.md) | Cài giọng theo OS, deploy, rollback |
| [specs/TESTING-ACCEPTANCE.md](specs/TESTING-ACCEPTANCE.md) | Ma trận test + Exit Gates |

## Ledger

| Thời điểm | Việc | Kết quả |
|---|---|---|
| 2026-09-19 14:33 | WP0 brain check | exit 0, "NÃO ĐÃ OK" |
| 2026-09-19 14:36 | Bộ SPEC Plan18 (7 file) | plan.md + specs/ đủ 4 mảng theo luật §2.1 |
| 2026-09-19 14:40 | WP1+WP2 catalog + policy | 31 test mới xanh; T4 chứng minh Ava thay Andrew |
| 2026-09-19 14:47 | WP3+WP4 preference/engine/UI | preferences 8/8, speech 17/17, engine 5/5, settings 5/5 |
| 2026-09-19 14:52 | WP5 skill `english-voices` | `.agents/skills/english-voices/` 3 file + shim 8 dòng |
| 2026-09-19 14:55 | G1 type-check | 0 lỗi |
| 2026-09-19 14:56 | G2 eslint | 0 lỗi / 28 cảnh báo (đúng baseline Plan15) |
| 2026-09-19 14:50 | G3 vitest | 129 file / 820 test PASS (trước: 126/779) |
| 2026-09-19 14:53 | G4 build | PASS, 66 dòng route, 0 lỗi |
| 2026-09-19 15:05 | G5 Playwright | 39/39 PASS (thêm 1 ca picker giọng thiết bị) |
| 2026-09-19 15:10 | WP7 đồng bộ não + ADR 0004 | today/state/kernel/index/roadmap/changelog |
| 2026-09-19 15:05 | Bổ sung 7 giọng rating cao (user yêu cầu) | catalog 40 → 47; SPEC-P180 §4 sửa trước; 5 gate xanh lại (820 test, 39/39) |
| 2026-09-19 15:05 | Đo giọng thật trên máy user | chỉ David/Zira Desktop (SAPI cũ) ⇒ phải dùng Edge hoặc cài giọng Natural |
| 2026-09-19 15:08 | Commit | `2f55862` docs(plan17), `dd6a69f` feat(plan18) |
| 2026-09-19 15:09 | Push | `origin/codex/vercel-turso-migration` d9321f4..dd6a69f |
| 2026-09-19 15:12 | Deploy production | `https://listena-qm16tv2ln-n-listen-ai.vercel.app` READY; alias https://listena.vercel.app trả 200, header `microphone=(self)`; CLI cần `--scope n-listen-ai` |
| 2026-09-19 15:30 | WP9 demo local (DB tạm :3101, AI Vyce thật) | 4 ảnh Playwright; dòng "Tự động" chưa nêu tên giọng ⇒ sửa ở `8cbf459` |
| 2026-09-19 15:55 | WP10 trang `/learner/settings` + nav 5 cột | build liệt kê route `/learner/settings`; E2E voice 5/5 |
| 2026-09-19 16:00 | F-01 tràn ngang 360px | `scrollWidth` 538 → 360 sau khi thêm `min-w-0` cho 3 `<fieldset>`; đã ghim bằng test |
| 2026-09-19 16:03 | Deploy production lần 2 | `https://listena-41keicmoi-n-listen-ai.vercel.app` READY, alias trả 200; `/learner/settings` trả 307 → `/login?callbackUrl=…` (route mới đã lên và được guard) |
