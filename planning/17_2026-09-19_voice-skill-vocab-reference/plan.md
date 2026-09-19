# Plan 17 — Skill `elevenlabs-voice` trong repo + tham khảo chức năng Vocab Master A2-B1

- STT: 17
- Created: 2026-09-19 (rạng sáng), Asia/Saigon
- Status: DONE LOCAL (docs-only) — không có thay đổi mã/DB/route; gate áp dụng = `init_brain.js --check` exit 0 + kiểm cấu trúc skill.
- SemVer: PATCH (tài liệu + skill, ≤ 1 ngày công) → được phép chỉ có `plan.md` (luật 2.5). Version giữ 0.7.0.
- Owner: root (một agent, auto-mode). Input user 2026-09-19: "check lại não, sau đó lấy voice bên elevenlab làm 1 skills voice vào repo nhé chứ k lấy api. sau đó tham khảo thêm các chức năng có trong 2 link này [english-vocab-master-a2-b1.ai.studio; aistudio.google.com/apps/8af2415c…]".
- Đọc trước: `brain4agent/memory-distill.txt` → `index.md` → `planning/16_.../plan.md` (WP2/WP4/WP5 còn mở) → `docs/adr/0003-elevenlabs-voice.md`.

## Diễn giải yêu cầu (chốt)

- "lấy voice bên elevenlab làm 1 skills voice vào repo, chứ k lấy api" = đưa **skill** (tài liệu quy trình theo chuẩn agentskills.io) của ElevenLabs vào repo, KHÔNG viết thêm mã gọi API và KHÔNG thêm SDK. Mã provider Plan15 đã có và giữ nguyên.
- "tham khảo chức năng 2 link" = khảo sát và ghi nhận, KHÔNG triển khai tính năng (mọi tính năng mới là MINOR → plan riêng có SPEC).

## Bất biến (vùng cấm)

- CẤM sửa mã trong `src/`, `prisma/`, `scripts/`, `package.json` trong plan này.
- CẤM sửa tay bản sao upstream trong `.agents/skills/elevenlabs-voice/references/upstream/` (chỉ chép lại từ upstream khi cập nhật).
- CẤM nhân bản luật vào `.claude/skills/elevenlabs-voice/SKILL.md` (shim ≤ 10 dòng, trỏ về `.agents/skills/...`).
- CẤM hard-code voice ID trong skill dành cho repo (ID trong upstream chỉ là ví dụ API).
- Giữ nguyên các file untracked có sẵn (`foo`, `test.xlsx`, `prisma/dev.db.bak-plan10`, file ký tự đặc biệt) ngoài commit.

## Work packages

| WP | Việc | Bằng chứng | Trạng thái |
|---|---|---|---|
| WP1 | Bước 0: `init_brain.js --check` | exit 0, "NÃO ĐÃ OK" (2026-09-19 02:05) | ✅ |
| WP2 | Clone `elevenlabs/skills` (MIT, commit `9edcbd4`, 2026-09-09) vào scratchpad; chép nguyên văn `text-to-speech/SKILL.md` + 3 references + `setup-api-key/SKILL.md` + LICENSE vào `.agents/skills/elevenlabs-voice/references/upstream/` | 6 file | ✅ |
| WP3 | Viết `.agents/skills/elevenlabs-voice/SKILL.md` (luật R1–R10, công thức A–D, bảng khác biệt với upstream) + `references/listenai-voice-contract.md` (module, endpoint, env, bảng lỗi) | 2 file; đối chiếu với `src/server/voice/{elevenlabs,http}.ts`, `src/app/api/voice/tts/route.ts`, SPEC-P150 | ✅ |
| WP4 | Shim `.claude/skills/elevenlabs-voice/SKILL.md` (Claude Code auto-load) | ≤ 10 dòng, trỏ về `.agents` | ✅ |
| WP5 | Khảo sát 2 link: curl + trích bundle JS; thử ego-browser (chưa cài) và Tabbit (exit 69); link editor cần Google login | `docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md` (chức năng, schema, đối chiếu, đề xuất, vùng cấm) | ✅ (không có ảnh UI; editor chưa xem) |
| WP6 | Đồng bộ não: `today.md`, `state.json`, `memory-distill.txt`, `index.md`, `roadmap.md`, `changelog.md`; rà `project-intro.md` + `-data-architecture.md` do thêm thư mục top-level `.claude/` (luật Structural Extension) | diff + `init_brain.js --check` exit 0 | ✅ |
| WP7 | Commit/push | CHỜ user (không tự commit) | ⬜ |

## Findings

- F-01: `ego-browser` không có trên PATH máy này (skill có nhưng CLI chưa cài); Tabbit CLI có nhưng Tabbit Browser chưa chạy (exit 69). Muốn chụp UI/đọc AI Studio editor: user mở Tabbit Browser (đã đăng nhập Google) rồi yêu cầu lại.
- F-02: App tham khảo không dùng LLM; 50 từ tĩnh, chấm điểm client, Firebase. Chỉ lấy ý tưởng UX (vòng 5 bước, từ hay sai, random review, tốc độ nghe, combo), không lấy kiến trúc.
- F-03: Claude Code auto-load `.claude/skills/`; chuẩn agentskills.io và repo (`index.md`) dùng `.agents/skills/`. Giải bằng shim, cùng nguyên tắc AGENTS.md/CLAUDE.md.

## Nhật ký quyết định

- 2026-09-19 02:05+07: Bước 0 PASS. Diễn giải yêu cầu như mục trên (skill = tài liệu, không mã).
- 2026-09-19 02:15+07: Nguồn skill = `github.com/elevenlabs/skills` (MIT). Chọn gói `text-to-speech` + `setup-api-key`; bỏ `speech-to-text` (repo dùng STT trình duyệt), `agents/speech-engine` (ngoài non-goals: không streaming/agent voice).
- 2026-09-19 02:20+07: Đặt tên skill `elevenlabs-voice`; canonical tại `.agents/skills/`, shim tại `.claude/skills/`. Bản sao upstream giữ nguyên văn kể cả voice ID ví dụ; SKILL.md của repo tuyên bố hợp đồng repo thắng.
- 2026-09-19 02:30+07: Không triển khai tính năng từ app tham khảo; ghi thành tài liệu + đề xuất plan MINOR sau.

## Quyết định bị thay thế

- (chưa có)

## Bằng chứng (ledger)

| Thời điểm | WP | Lệnh / hành động | Kết quả |
|---|---|---|---|
| 2026-09-19 02:05 | WP1 | `node .../init_brain.js E:/app-hoc-tieng-anh --check` | exit 0, NÃO ĐÃ OK, marker v1.4.0 |
| 2026-09-19 02:08 | WP2 | `git clone --depth 1 https://github.com/elevenlabs/skills.git` | HEAD `9edcbd4b80ed57b8e07a3f86ea520333969fbc3c` (2026-09-09) |
| 2026-09-19 02:10 | WP5 | `curl` trang + bundle 892 684 byte; grep chuỗi | meta description + 50 `term:`; không có `generateContent` |
| 2026-09-19 02:12 | WP5 | `ego-browser nodejs` / `tabbit-cli nodejs --task survey-vocab` | command not found / exit 69 |
| 2026-09-19 02:40 | WP6 | `node brain-sync.mjs` (today/state/distill/index/roadmap/changelog/project-intro) rồi `init_brain.js --check` | brain sync ok; exit 0, NÃO ĐÃ OK; git: 7 file brain M, mới `.agents/`, `.claude/`, docs reference, planning/17 |
