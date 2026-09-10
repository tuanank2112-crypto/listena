# 📅 Nhật Ký Làm Việc Ngày 07/09/2026 (Session Memory Log)

## Plan06 KiraAI provider deployment 2026-09-10 — pending fresh secret and smoke
- Account owner selected KiraAI for the next Worker deployment: `AI_PROVIDER=kira`, model `glm-5.3-flash-free`, base URL `https://kiraai.vn/api/v1`, and secret name `KIRAAI_API_KEY`. The key value was not written to a repository file or log.
- Kira documents OpenAI-compatible `POST /chat/completions`, not OpenAI `POST /responses`. The adapter must parse the completion JSON and run the existing server-side Zod validation; it cannot claim OpenAI Responses strict-schema or `store:false` behavior.
- P65/Kira code is public as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250`; public `/api/health` and `/login` returned HTTP 200 with the Kira key absent. No genuine Kira lesson has been claimed yet.

## Plan06 deployment 2026-09-10 — personalized AI and adaptive games
- Worker `listena-english` version `8d50494f-773f-46bb-9910-23c4474d9b4d` is public at https://listena-english.tuanank2112.workers.dev. Remote D1 received only additive migrations `0002_personalized_ai_learning.sql` and `0003_personalized_generation_guards.sql`, then the reviewed idempotent core import. Postflight: original user preserved; 1 non-loginable system curriculum owner; 5 lessons, 116 vocabulary, 20 segments and 54 exercises.
- Personalized lessons are private owner-bound artifacts generated through a real server-side OpenAI Responses boundary (`POST /responses`, strict JSON schema, `store:false`, ≤20 s deadline). No runtime mock/fallback is selectable. Missing/invalid provider configuration returns typed unavailable status without inventing lesson/tutor copy.
- Games retain Quiz/Match/Spell forms but the server owns candidate selection, hidden validators, scoring, evidence and mastery. New runs are limited to one per 10 seconds and 12 per rolling 24 hours; answer retry is idempotent.
- Historical pre-Kira gates: `npm test` 204/204, type-check PASS, lint 0 errors/36 warnings, Worker build PASS, E2E 16/16 using a test-process-only Responses transport stub. The current Kira deployment requires a fresh owner-entered `KIRAAI_API_KEY`, not the historical `OPENAI_API_KEY`, before the one real-provider smoke.

## Final verification 2026-09-10 — Plan05 Cloudflare Worker + D1 public
- User chọn Cloudflare Workers + D1. Vinext check đạt 16/18 nhưng `next-auth` bị chặn; giữ Auth.js và dùng OpenNext. Next nâng 16.3.1 → 16.3.3.
- D1 `listena-english` APAC nhận `migrations/0001_initial_schema.sql` (56 commands), schema-only. Không seed/reset/import production.
- Prisma: local Node/dev/E2E dùng libSQL SQLite với timestamp `unixepoch-ms`; Worker production dùng `@prisma/client/wasm.js` + request-scoped `PrismaD1`. TTS Worker bỏ disk cache và fallback browser speech.
- Worker public: https://listena-english.tuanank2112.workers.dev (version `ec0849c7-7f01-46e5-bdf4-be8392268fdc`). Hosted `NEXTAUTH_SECRET`; build scan xác nhận local auth/OpenAI/TTS secret không nằm trong Worker artifact. `AUTH_URL`/`NEXTAUTH_URL` là Worker vars public cố định; `trustHost` xử lý internal localhost hop của OpenNext.
- Gates: type-check PASS, lint 0 error/37 warnings, unit 152/152, Prisma validate PASS, eval 15/15, E2E 16/16 isolated SQLite, Worker build PASS. Production: `/api/health`, D1 registration, CSRF, Credentials login, session đều PASS. Tài khoản smoke được select exact và xoá; count test account còn 0.

## Final verification 2026-09-10 — Plan04 completed local
- Audit after Plan03 selected only three connected P1 gaps: Daily Quest planned recency was absent from the real start path; zero-evidence sessions could complete and receive time; learner meters displayed profile columns rather than AI-updated SkillMastery.
- Plan04 passes bounded owned Quest history to the planner; excludes malformed states. Completion now requires persisted evidence. Evidence-backed early exits become PARTIAL with remediation UI/no trophy, while BOSS success remains COMPLETED. Dashboard/progress resolve adaptive mastery first.
- Gates: 152/152 unit (38 files), type-check, lint 0 error/37 warning, eval 15/15 mock, Prisma validate, build, Python TTS 3/3, isolated E2E 16/16. No schema migration, DB reset, deploy, production/real-provider/real-efficacy claim.
- Deferred: unified evidence schema for legacy attempt/review/game; client-trusted game scoring; self-service teacher role; SQLite/Render PostgreSQL compatibility; provider quotas/timeouts; live TTS speed.

## Checkpoint 2026-09-08 — paused, not accepted
- User authorized autonomous completion, then requested stop/report near usage limits. Three Terra High agents hit limits mid-code; root reviewed/integrated and paused.
- Memory transaction + typed tutor context, next-action API/UI, shared timeline/curriculum, TTS auth/cache boundaries are present but not fully verified.
- Latest type-check PASS. 111 unit tests passed before final root changes; final unit/lint/build/eval/E2E/Python checks pending.
- Resume: [checkpoint](../../../docs/LEARNING_LOOP_CHECKPOINT_2026-09-08.md), [Plan03](../../../planning/03_2026-09-08_learning-loop-completion/plan.md). No commit/deploy or real DB mutation.
- All older claims below are historical, not current acceptance.

## Resume verification 2026-09-08
- Unit: 138/138 PASS (34 files); type-check PASS; lint 0 errors / 37 warnings; build PASS; Prisma validate PASS; mock eval 15/15 PASS.
- Playwright E2E remains blocked by environment-level `browserType.launch: spawn EPERM`; no E2E PASS claim is made.
- Dedicated memory/TTS tests pass: 21/21 TypeScript and 3/3 Python sidecar boundary tests. Plan 03 remains open only for isolated browser verification, which is environment-blocked by Playwright `spawn EPERM` before assertions.

## Final verification 2026-09-08
- Plan03 status is COMPLETED LOCAL. All checks PASS: 139/139 unit, type-check, lint 0 errors/37 warnings, eval 15/15 mock, Prisma validate, build, Python sidecar 3/3, E2E 15/15 fresh SQLite with mock tutor.
- Earlier EPERM conclusion was superseded: the real blocker was stale repo dev server PID 24896. After stopping it, Chromium and all browser assertions ran.
- Auto completion can intentionally recommend PRACTICE when communication mastery is still below 0.6. Deterministic mock now marks successful BOSS as complete/DEBRIEF; regression test added.
- No commit/deploy, no user DB mutation, no production/real-efficacy/latency/voice-speed claim.

> Cập nhật lúc: `2026-09-07T20:55:00+07:00` | Phiên bản: `v0.2.1` (eval harness verified)

---

## 🎯 Thành Tựu Cốt Lõi Đạt Được Trong Phiên:
1. **Khôi phục demo có dữ liệu:**
   - Seed demo thành công (2 users, 1 course, 3 lessons, 12 vocabulary, 1 recommendation).
   - Dashboard/Lessons/Games còn lọc theo tên course cũ `TATQHP1...` và title `Bài ` nên hiển thị trống dù DB có dữ liệu.
   - Đã đồng bộ course filter và bỏ ràng buộc title ở dashboard/games/lessons; đã login và verify UI thật có 3 lessons + games.
2. **Hoàn tất Plan 02 local gates:**
   - Learner memory + migration, next action, timeline, eval harness đã có và chạy được.
   - Cập nhật plan/checklist, TESTING-ACCEPTANCE, roadmap, changelog, gotchas.

---

## 🧪 Kết Quả Benchmark / Kiểm Thử Thực Chiến:
- Type-check: PASS.
- Unit test: 105/105 PASS (27 files).
- ESLint: 0 errors, 38 warnings.
- Prisma validate + migrate status: PASS, 3 migrations up to date.
- Production build: PASS.
- Playwright E2E: 7/7 PASS (chromium, isolated DB, AI_PROVIDER=mock).
- Pedagogical eval: 15/15 PASS mock; grounded 7/15 — chưa chứng minh hiệu quả học thật.

---

## 📁 Danh Sách File Đã Tạo / Sửa:
- **Chỉnh sửa:** `src/app/learner/dashboard/page.tsx`, `src/app/learner/games/page.tsx`, `src/app/learner/lessons/page.tsx` — đồng bộ course seed và hiển thị lessons.
- **Đồng bộ:** `planning/02_2026-09-07_ai-native-upgrade/plan.md`, `planning/02_2026-09-07_ai-native-upgrade/specs/TESTING-ACCEPTANCE.md`, `brain4agent/roadmap.md`, `brain4agent/changelog.md`, `brain4agent/-known-gotchas.md`.

---

## ⚠️ Bẫy Kỹ Thuật (Gotchas) & Lưu Ý:
- Không hard-code course/title khi query curriculum; seed có thể đổi tên dữ liệu.
- Chạy E2E cần dừng dev server cũ trên cùng cổng, vì Next 16 phát hiện existing dev server và webServer exit code 1.
- Số grounded 7/15 không dùng để tuyên bố hiệu quả sư phạm; cần eval với người học thật ở plan sau.

## 🔁 Cập nhật 20:55
- Eval P13 được nâng từ self-assert sang harness thật gọi orchestrator với DeterministicMockTutorProvider.
- Phát hiện và sửa: mock luôn giữ phase ENCOUNTER; retrieval dùng context mặc định nên mọi input đều grounded.
- Mock hiện quyết định bằng target vocabulary + độ dài; retrieval chỉ dùng learner message và chặn stop-word/off-topic.
- Gates lại: type-check PASS, 106/106 tests, lint 0 error/38 warning, build PASS, Prisma 3 migrations, eval 15/15 với grounded 4/15 đúng kỳ vọng.
