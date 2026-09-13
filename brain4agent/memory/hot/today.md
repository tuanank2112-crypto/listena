# 📅 Nhật Ký Làm Việc Ngày 07/09/2026 (Session Memory Log)

## Plan08 implementation + local acceptance 2026-09-13 — current checkpoint
- Root completed and integrated the Plan08 local scope for the AI-native self-learning loop: P81 reliability, P82 learner intent/truth, P83 shared bounded planner, P84 offline quality assets, and P85 local acceptance. Existing Mission/Coach/Daily Quest, server grading, evidence and adaptive context were strengthened rather than replaced.
- Fresh local evidence: `npm test` 387/387 across 78 files; `npm run type-check` PASS; lint exit 0 with 34 pre-existing warnings; production build PASS; `npx prisma validate` and `npx prisma generate` PASS; isolated fresh-SQLite Playwright E2E 20/20; offline quality evaluation 30/30 cases and 12/12 dataset checks. The recommendation read path now has an all-application-table no-mutation E2E fingerprint.
- This checkpoint is deliberately not a deployment/cutover claim. Vercel/Turso Preview and Production completion, final D1 export, traffic cutover, reconciliation-aware rollback, a successful live provider call, and a consented learner pilot remain OPEN. Plan07 stays the active infrastructure plan and version remains 0.5.0.
- Independent audit found no remaining P0/P1 in the delivered reliability/learning-loop scope. Deferred nonblocking P2: if a Coach lesson is unpublished after provider output but before the atomic target commit, its reservation can be spent; the target commit returns unavailable and persists no stale learning graph. Treat this as bounded quota waste follow-up, not evidence corruption.

## Historical review + orchestrator plan 2026-09-13 — planning phase (superseded for local implementation status)
- User reaffirmed AI-native English self-learning and requested project review/report/improvement plan with root as orchestrator.
- Brain boot check passed. Reviewed source at aa2021d, created docs/PROJECT_REVIEW_2026-09-13.md and Plan08 spec package with dependency/ownership/acceptance contracts. No implementation agents started; no application source or deployment changed.
- Eight findings recorded: GET recommendation writes through method-only disabled fence; non-atomic account graph; different auth-secret precedence; no create-session request deduplication; zero-evidence50% ability display; fragmented planner/preferences/evidence; capped recent-attempt count mislabeled; mock-only eval cannot prove hosted AI or learning efficacy.
- Reran npm run test:293/293 in67 files (9.86s); npm run type-check exit0. Build/lint/E2E remain historical2026-09-12 evidence, not rerun. Existing dirty eval/report.md, foo and special-character filename preserved.
- At that time Plan07 remained active and Plan08 was PLANNED, target proposed0.7.0 after0.6.0; reliability preceded accepting hosted writes, followed by learner intent/calibration truth, shared planner and live/pedagogical validation. This planning-phase status is superseded for local work by the current checkpoint above; hosted gates remain open.

## Plan07 Vercel + Turso Preview 2026-09-12 — bounded hosted proof, full gate still open
- Canonical Tokyo Turso staging `listena-staging-20260911` received the approved one-way D1 snapshot and passed schema/index/FK/timestamp/core-curriculum fingerprints plus integrity checks. The canonical target was not used for Preview writes.
- Vercel Preview candidate commit `587641a` built Ready after the hosted empty-`LOG_LEVEL` normalization. A short enabled window used only disposable clone `listena-preview-20260912`: synthetic registration reached a fresh target dashboard and one correct adaptive-game answer persisted a keyed server-scored round with linked evidence. Direct clone checks found one profile, six mastery rows, one run/eight rounds, one answered correct keyed round, and one linked server-validator evidence row; integrity/quick/FK checks were clean.
- Tutor returned the controlled unavailable UI state on the target. This is a correct fail-closed provider outcome, not a successful Kira generation, key inspection, or cost/latency claim.
- Final branch Preview deployment `ENR7GSojzpCt3ucxnNVus51eZ6AT` restored `MIGRATION_WRITE_MODE=disabled`; a new synthetic registration was rejected and had zero matching clone rows before/after. No Production secret/database, D1 mutation, DNS, or public traffic change occurred.
- Fresh local verification: `npm test` 293/293 (67 files), type-check, lint 0 errors/34 existing warnings, standard build, and isolated Playwright E2E 16/16 all pass. Still open: hosted duplicate retry/idempotency, private owner isolation, full disabled-session/fingerprint coverage, final D1 export/Production/cutover/rollback, and a successful live provider call.

## Plan07 Vercel + Turso local candidate 2026-09-11 — local gates accepted, hosted gates open
- Plan07 replaces the future target runtime with Next.js Node on Vercel plus Turso/libSQL, while retaining the existing Cloudflare Worker + D1 deployment as a rollback asset. `APP_RUNTIME=vercel` requires complete Turso configuration and fails closed; local/E2E keeps SQLite. Cloudflare D1/WASM/OpenNext runtime imports are not retained on the target application path.
- Provider-neutral libSQL atomic batches preserve learning, game, personalized-lesson and AI-budget commit fences. Hosted unsafe API writes are fenced by `MIGRATION_WRITE_MODE=disabled` until a separately recorded enable; Auth.js remains the narrow CSRF/session exception. Database configuration/operational failures are opaque typed 503s, never a local fallback or driver/secret disclosure.
- Local evidence: `npm test` 284/284 across 66 files, `npx tsc --noEmit`, `npm run lint` with 0 errors / 34 pre-existing warnings, standard `npm run build`, and isolated `npm run test:e2e` 16/16. The P73 migration verifier passed 7/7 local fixture tests and is deliberately read-only; fixture proof is not a D1 export/import, Turso staging write/read/delete, or hosted proof.
- Not performed or claimed: Turso account/database setup, Vercel Preview/production deployment, D1 export/import/reset/seed/write, DNS or public-traffic cutover, hosted write enable, Cloudflare rollback drill, or a bounded live Kira smoke. Final D1 export and cutover still require explicit approval after staging acceptance.

## Plan06 KiraAI provider deployment 2026-09-10 — secret binding installed, smoke pending
- Account owner selected KiraAI for the next Worker deployment: `AI_PROVIDER=kira`, model `glm-5.3-flash-free`, base URL `https://kiraai.vn/api/v1`, and secret name `KIRAAI_API_KEY`. The key value was not written to a repository file or log.
- Kira documents OpenAI-compatible `POST /chat/completions`, not OpenAI `POST /responses`. The adapter must parse the completion JSON and run the existing server-side Zod validation; it cannot claim OpenAI Responses strict-schema or `store:false` behavior.
- P65/Kira code is public as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250`; public `/api/health` and `/login` returned HTTP 200 with the Kira key absent. Cloudflare then created the opaque `KIRAAI_API_KEY` binding as secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b`. No genuine Kira lesson has been claimed yet.

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
