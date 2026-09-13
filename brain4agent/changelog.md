# Changelog

## Unreleased — Plan08 local implementation and acceptance (2026-09-13; hosted/live/pilot open)
- Complete the local AI-native self-learning improvement package: P81 removes read-side recommendation persistence, makes account/session-start boundaries atomic and durable, aligns auth-secret resolution, and proves the disabled-read surface with an all-table E2E fingerprint; P82 adds learner intent plus honest mastery/count presentation; P83 routes dashboard/session/game actions through one bounded, evidence-aware planner; P84 adds versioned offline quality cases; P85 records independent local acceptance.
- Local evidence: 387/387 tests across 78 files, type-check PASS, lint exit 0 with 34 pre-existing warnings, standard Next production build PASS, Prisma validate/generate PASS, isolated fresh-SQLite E2E 20/20, and offline quality evaluation 30/30 cases with 12/12 dataset checks.
- This entry does not release or deploy anything: Plan07 remains active; Vercel/Turso Preview and Production, final D1 export/cutover/rollback, successful live-provider behavior, and consented learner pilot remain open. `current_version` remains 0.5.0.
- Deferred nonblocking P2: a Coach reservation can be consumed when its lesson becomes unpublished after provider output but before the atomic published-target commit. The commit safely rejects the stale target and writes no stale learning graph; track the bounded quota waste separately.

## Historical planning-only — AI-native review 2026-09-13 (superseded for local implementation status)
- Added evidence-backed project review (8 source findings) and Plan08 multi-file specs: contracts, runtime reliability, learner intent/calibration truth, shared planner, orchestration ownership, operations and environment-specific acceptance.
- Reaffirmed user direction: AI-native self-directed English learning; existing Mission/Coach/Quest, server grading, memory/calibration remain foundations, not rewrite targets.
- Fresh verification:293/293 tests across67 files + type-check pass. No application fixes, migration, deployment, live-provider success or learning-efficacy result in this review. Plan07 remains active; new GET-side-effect finding qualifies previous bounded write-fence evidence.

## Unreleased — Plan07 Vercel/Turso staging + bounded Preview evidence (not cut over)
- Add an explicit Node runtime boundary: local development/E2E uses file-backed SQLite, while `APP_RUNTIME=vercel` requires complete server-only Turso settings and fails closed without a local fallback. The target Vercel module graph no longer depends on Worker D1, Prisma WASM, or OpenNext Cloudflare runtime APIs.
- Replace D1-only multi-row persistence with a parameterized libSQL atomic-batch contract that preserves server-owned commit fences and idempotency for learning sessions, AI budgets, adaptive games and private lessons. Configuration/operational database failures return opaque typed `503` responses; driver causes, endpoints and credentials are not exposed.
- Add a hosted migration-write fence: Vercel unsafe application API mutations remain disabled until exact `MIGRATION_WRITE_MODE=enabled`; Auth.js CSRF/session routes are narrowly excluded so login semantics remain intact.
- Add a read-only D1-to-Turso verifier and use it for a one-way canonical staging import proof. A disposable clone—not the canonical staging target—backed a bounded Preview enabled window: fresh synthetic registration/dashboard, one persisted server-scored adaptive-game evidence row, direct clone readback, and a typed Tutor-unavailable result. Preview was returned to disabled and a blocked registration left no matching clone user. No Production secret/database, D1 mutation, DNS/public traffic cutover, rollback drill, or successful live Kira claim is made.
- Local acceptance on 2026-09-12: 293 unit tests across 67 files, type-check, lint with 0 errors / 34 pre-existing warnings, standard Next production build and isolated E2E 16/16 all pass. Vercel Preview build for `587641a` is Ready; full hosted duplicate-retry/private-owner and all Production gates remain open. `current_version` remains 0.5.0 until a separately accepted release.

## Unreleased — KiraAI adapter and P65 deployed
- Deploy KiraAI with non-secret configuration `AI_PROVIDER=kira`, `KIRAAI_MODEL=glm-5.3-flash-free`, and `KIRAAI_BASE_URL=https://kiraai.vn/api/v1` as Worker `ee5de83a-c2a9-45e3-996a-e624072bb250`; the value of `KIRAAI_API_KEY` is not stored in this repository.
- Add a native-D1 reservation/commit-fence boundary for P65 learning-session, private-lesson/attempt and adaptive-game graphs, with 40 rolling-24-hour AI reservations, a 30-second pending lease, and an applicable 12-second one-off cooldown.
- Document the protocol boundary: Kira uses Chat Completions with server-side JSON/Zod validation, whereas OpenAI remains an optional Responses transport with its strict-schema/store controls. Secret-change version `d1347978-d0c6-4c66-bf44-01315783ec9b` installs the binding name only; no live-AI success is claimed by this entry.

## 0.5.0 — 2026-09-10 (Cloudflare deployment; live-provider key pending)
- Restore the tracked core curriculum to production D1 via an additive, idempotent import: 5 lessons, 116 vocabulary items, 20 segments and 54 exercises. Existing user data was preserved; the system curriculum owner cannot log in.
- Add owner-private, persisted personalized lessons backed by a real OpenAI Responses structured-output boundary. The browser never receives validators or correct answers; missing/invalid upstream configuration returns a typed unavailable response rather than mock content.
- Add calibration/evidence and familiar Quiz/Match/Spell games that use server-owned adaptive selection, hidden validators, exactly-once answer writes and per-learner resource guards (10 seconds / 12 fresh runs per 24 hours).
- Historical pre-Kira deployment: Worker `8d50494f-773f-46bb-9910-23c4474d9b4d`. Verified 204 unit tests, type-check, lint 0 errors/36 warnings, Worker build, E2E 16/16 and public root/login HTTP smoke. `OPENAI_API_KEY` was not configured in that historical deployment; the current selected provider is KiraAI.

## 0.4.0 — 2026-09-10 (Cloudflare Workers + D1 public release)
- Deploy OpenNext Next 16.3.3 app to public Cloudflare Worker and bind production D1 as `DB`; schema is checked-in `migrations/0001_initial_schema.sql` (56 commands).
- Prisma selects local libSQL SQLite for Node/dev/E2E and request-scoped D1 with the Worker WASM client in production. Auth.js redirects use the fixed public Worker origin and trusted internal OpenNext host.
- Remove Worker-incompatible TTS disk cache; optional VieNeu failure remains browser-speech fallback.
- Verified: type-check, 152 unit tests, lint 0 error/37 existing warnings, Prisma validate, eval 15/15, isolated SQLite E2E 16/16, Worker build, production D1 registration and CSRF/Credentials/session smoke. Temporary production smoke users were deleted exactly; no production seed/import.
- Does not claim custom-domain setup, backup/restore readiness, paid Cloudflare features, third-party AI/TTS configuration, quotas, or pedagogical efficacy.

## 0.3.0 — 2026-09-10 (working tree, chưa commit/deploy)
- Daily Quest start path truyền history scenario owned đã validate cho planner, tránh lặp authored scenario khi còn lựa chọn khác.
- Session không evidence không thể complete/cộng phút; manual end có evidence nhưng chưa qua success state là `PARTIAL`, debrief chỉ dẫn luyện tiếp thay vì trophy. Auto BOSS success vẫn là `COMPLETED`.
- Dashboard/progress dùng `SkillMastery` adaptive cho meter nghe/từ vựng/chính tả, profile chỉ fallback với skill chưa có record.
- Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 16/16 DB tạm.
- Không thêm schema migration; không claim deploy/production DB, AI efficacy, live voice latency/speed, rate/quota hay production security closure.

## 0.2.1 — 2026-09-08 (working tree, chưa commit/deploy)
- Memory, evidence và mastery commit trong cùng transaction; retry idempotent; corrupt memory được validate và rollback có test.
- Next action sau manual/auto completion giữ qua reload và dẫn COACH/MISSION/QUEST/PRACTICE owned; mastery dưới 0.6 chủ động chọn luyện lại.
- Timeline shared cho dashboard/progress, tổng 7 ngày không bị giới hạn 50 mục; curriculum không phụ thuộc tên course và loại DRAFT.
- TTS API/sidecar yêu cầu auth và shared key, cache private ngoài public; boundary tests không warm-up/download model.
- Local gates PASS: 139 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 15/15 DB tạm.
- Không claim production readiness, hiệu quả sư phạm thật, voice speed/latency/quota hay deploy.

## 0.1.1 — 2026-09-07 (working tree, chưa commit/deploy)
- Chốt AI-native theo người dùng; dashboard resume/khởi tạo phiên AI là hành động chính.
- Sửa secure-cookie proxy/role redirects, teacher/course owner và draft attempt gate.
- Validator quyết định feedback/state/evidence; CHOICE index phải hợp lệ.
- Completion auto/manual tăng thời gian một lần trong transaction.
- SRS counters tích lũy; queue đến hạn, hết lượt, retry lỗi; intervention reset và bỏ dead voice toggle.
- Unit/browser regression, database E2E riêng, docs/plan/brain engine1.7.2/template1.4.0.
- Bằng chứng cuối ở TESTING-ACCEPTANCE; không suy production readiness.

## 0.2.0 — 2026-09-07 (working tree, chưa commit/deploy)
- Thêm LearnerMemory + migration, learner timeline, nextAction sau completion và pedagogical eval mock.
- Sửa demo dashboard/games/lessons lọc theo course seed cũ khiến trang hiển thị trống.
- Gates local PASS: type-check, 106 unit tests, lint 0 error, Prisma 3 migrations, build, E2E 7/7, eval 15/15 orchestration mock.
- Lưu ý: eval giờ gọi thật orchestrator; grounded 4/15 đúng kỳ vọng, chưa chứng minh hiệu quả học tập thật; production DB/deploy chưa làm.

- 2026-09-07 20:55: Nâng eval từ self-assert sang harness thật qua orchestrator; mock quyết định theo target vocabulary + độ dài, retrieval chỉ theo learner message và chặn off-topic/vague.
