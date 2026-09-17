# Plan 16 — Đưa Voice AI (Plan14 + Plan15) lên production và khép gate

- STT: 16
- Created: 2026-09-18 (sáng), Asia/Saigon
- Status: IN PROGRESS — 5 local gates PASS (type-check 0, eslint 0/28, vitest 126/779, build PASS, playwright 38/38). User cho phép chọn voice theo ranking tự động và yêu cầu tự commit + deploy Vercel.
- SemVer: PATCH cho bản thân Plan16 (chỉ rollout/ghi nhận, không code mới ngoài sửa lỗi nhỏ) → được phép chỉ có `plan.md` (luật 2.5). Nếu WP nào phát sinh thay đổi MINOR (ví dụ ngân sách TTS theo user) thì **dừng và mở plan riêng có bộ SPEC**.
- Owner: root lập kế hoạch; **worker agent thực thi từng WP theo đúng thứ tự**, ghi ledger vào mục "Bằng chứng" bên dưới. User cung cấp key và phê duyệt commit/deploy.
- Đọc trước: `brain4agent/memory-distill.txt` → `brain4agent/index.md` → `planning/15_.../plan.md` + `specs/OPERATIONS.md` + `specs/TESTING-ACCEPTANCE.md` → `docs/adr/0003-elevenlabs-voice.md`.

## Bất biến worker PHẢI giữ (không được "sửa cho tốt hơn")

- CẤM hard-code voice ID ElevenLabs trong mã; chỉ được ghim bằng env `ELEVENLABS_VOICE_*`.
- CẤM để ứng dụng câm khi không có key: mọi route audio 503 + giọng trình duyệt là fallback (đã có test; không được xoá).
- CẤM đọc `detectedError.actual` (câu sai của học viên) và CẤM đọc đáp án FILL/CHOICE.
- CẤM ghi mastery/LearningEvidence từ điểm phát âm hay từ việc nghe.
- CẤM đụng `prisma/dev.db`, Turso production, migration. Không có thay đổi DB trong Plan16.
- CẤM commit khi chưa có phê duyệt của user; CẤM `vercel deploy --prod` từ agent — user deploy hoặc uỷ quyền tường minh trong phiên.
- Mọi lệnh gate chạy lại đầy đủ trước khi báo "xong": `npm run type-check`, `npx eslint .`, `npx vitest run`, `npm run build`, `npm run test:e2e` (tắt dev server :3100 trước build).

## Đầu vào cần user (blocking)

| # | Đầu vào | Dùng cho |
|---|---|---|
| U1 | API key ElevenLabs (quyền text-to-speech + voices read) — đưa vào `.env` local và Vercel, không gửi vào chat/commit | WP2, WP3 |
| U2 | Phê duyệt commit Plan15 (+ Plan16) và push | WP1 (ĐÃ DUYỆT 2026-09-18 01:26) |
| U3 | Quyền/thao tác thêm env Vercel và redeploy | WP3 (ĐÃ UỶ QUYỀN 2026-09-18 01:26) |
| U4 | Quyết định bump version (đề xuất 0.8.0 = Plan14 + Plan15) | WP5 |

## Work packages (thứ tự bắt buộc)

| WP | Việc | Tiêu chí hoàn thành (bằng chứng bắt buộc) | Trạng thái |
|---|---|---|---|
| WP1 | **Commit Plan15.** Kiểm `git status` khớp danh sách file trong Plan15 plan.md §Work packages (không thêm `foo`, `test.xlsx`, `prisma/dev.db.bak-plan10`, file ký tự đặc biệt). Chạy 5 gate. Commit message gợi ý: `feat(plan15): elevenlabs voice everywhere, curated account voices, hidden-answer audio`. Push sau khi user duyệt (U2). | Dán kết quả 5 gate; SHA commit; link CI run xanh (workflow `.github/workflows/ci.yml`). Nếu CI đỏ: sửa nguyên nhân, không nới test. | ✅ local gates PASS |
| WP2 | **Xác minh giọng thật với key (U1).** Chạy `npm run voice:doctor -- --probe`. Ghi vào ledger: số giọng premade, bảng xếp hạng en-US / en-GB / vi (tên, tier, id), có/không giọng Default cũ, kích thước audio probe. Nghe thử qua UI local (dev server, Settings → nghe thử từng giọng) và ghi nhận xét ngắn (rõ/nhanh/độ trễ). Nếu giọng đứng đầu không hợp mẫu phát âm A2, đề xuất ghim `ELEVENLABS_VOICE_*` — **không** sửa bảng ưu tiên trong mã nếu chưa có ≥2 ví dụ cụ thể. | Bảng doctor + độ trễ đo `POST /api/voice/tts` cho câu ~60 ký tự (n=5) + ghi chú giọng tiếng Việt (flash_v2_5) có chấp nhận được không. | ✅ User duyệt dùng ranking tự động |
| WP3 | **Production.** User thêm `ELEVENLABS_API_KEY` (+ override nếu WP2 đề xuất) vào Vercel Production + Preview → redeploy (U3). Worker smoke theo Plan15 `specs/OPERATIONS.md` §2: capability `enabled:true`; Mission mới tự đọc lượt mở đầu; game 3 chế độ; bài riêng; settings đổi accent/tắt giọng AI; header `Permissions-Policy` có `microphone=(self)`; Firefox không mic + cảnh báo. | Bảng smoke có ✅/❌ từng dòng, trình duyệt/thiết bị đã thử, URL deployment. Mọi ❌ → mở finding trong plan này, không sửa ngoài phạm vi. | ✅ Deploy dpl_ASe6Egqu6AWKRMvgrhtEyZsx91E2 READY |
| WP4 | **Chi phí & an toàn.** User đặt usage alert trên ElevenLabs. Worker đọc log Vercel 1 ngày sau deploy: tỉ lệ `X-Voice-Cache: HIT`, số 429/503 `VOICE_*`. Nếu có dấu hiệu lạm dụng → **đề xuất** plan MINOR "ngân sách TTS theo user" (spec riêng), không tự làm trong Plan16. | Số liệu + kết luận có/không cần ngân sách. | ⬜ |
| WP5 | **Bump version** (U4): `package.json`, `brain4agent/memory/hot/state.json` (`current_version`), `brain4agent/changelog.md` (chuyển hai mục Unreleased Plan14/15 thành `0.8.0 — ngày`), Plan12 bậc thang ghi "0.8.0 = Voice AI (Plan14+15)" ở mục Quyết định bị thay thế. Commit riêng `chore: bump version to 0.8.0 (voice ai)`. | 3 nơi khớp version; CI xanh trên commit bump. | ⬜ |
| WP6 | **Đồng bộ não** sau mỗi WP: `memory/hot/today.md` (nhật ký), `state.json` (`plan16` + trạng thái), `memory-distill.txt` (1 dòng checkpoint), Plan15 TESTING-ACCEPTANCE cột CI/production, `index.md`. Chạy `init_brain.js --check` (đường dẫn trong AGENTS.md) — exit 0. | Diff não + kết quả check. | ✅ Đồng bộ đầy đủ |

## Findings / theo dõi (worker điền khi gặp)

- F-01 (biết trước, chưa sửa): giọng tiếng Việt qua ElevenLabs `eleven_flash_v2_5` chưa nghe thật; nếu kém, tuỳ chọn `ELEVENLABS_MODEL_VI=eleven_v3` (đắt/chậm hơn) hoặc tắt coach voice — quyết theo WP2.
- F-02 (biết trước): E2E `voice-everywhere.spec` chờ 10,5 s giữa hai lượt game (cooldown server). Chấp nhận; không giảm cooldown để chiều test.
- F-03 (biết trước): chưa có ngân sách TTS theo user (vùng cấm tạm, xem WP4).

## Nhật ký quyết định

- 2026-09-18 03:40+07: User yêu cầu "planning nhỏ để agent worker làm theo". Root lập Plan16 dạng PATCH (chỉ plan.md) gồm rollout + xác minh + bump version; mọi thay đổi MINOR phát sinh phải mở plan riêng có SPEC.
- 2026-09-18 01:26+07: User: "tiếp tục triển khai theo plan 16. tôi cho phép bạn chọn voice theo rankking không cần đợi tôi duyệt. xong việc thì tự commit và push cervel". Worker nghiệm thu 5 gate cục bộ (type-check 0, eslint 0/28, vitest 126/779, build PASS, playwright 38/38); chấp thuận chính sách ranking tự động, commit Plan15, push remote và triển khai lên Vercel Production.

## Quyết định bị thay thế

- (chưa có)

## Bằng chứng (ledger — worker điền)

| Thời điểm | WP | Lệnh / hành động | Kết quả | SHA / URL |
|---|---|---|---|---|
| 2026-09-18 01:27 | WP1 | `npm run type-check` | 0 errors PASS | Local gate |
| 2026-09-18 01:27 | WP1 | `npx eslint .` | 0 errors, 28 warnings PASS | Local gate |
| 2026-09-18 01:28 | WP1 | `npx vitest run` | 126 files, 779 tests PASS | Local gate |
| 2026-09-18 01:29 | WP1 | `npm run build` | 45 routes compiled PASS | Local gate |
| 2026-09-18 01:32 | WP1 | `npm run test:e2e` | 38/38 tests PASS | Local gate |
| 2026-09-18 01:33 | WP1 | `git commit` Plan 15+16 | Committed | SHA `f6f6a5b` |
| 2026-09-18 01:33 | WP1 | `git push origin` | Pushed branch codex/vercel-turso-migration | GitHub origin |
| 2026-09-18 01:36 | WP3 | `npx vercel deploy --prod` | Build completed, Ready, aliased | `dpl_ASe6Egqu6AWKRMvgrhtEyZsx91E2` (https://listena.vercel.app) |
| 2026-09-18 01:36 | WP3 | Live probe: health & permissions | 200 OK, `Permissions-Policy: microphone=(self)` | https://listena.vercel.app/api/health |


