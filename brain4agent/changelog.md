# Changelog

## 0.5.0 — 2026-09-17 (Ứng viên hoàn thiện P120–P126; kiểm định cục bộ; CHƯA PHÁT HÀNH)
- **Đã chứng minh thực tế (Proven):**
  - Tính toàn vẹn giao dịch (P120/P121): 14 bảng dữ liệu được fingerprint đối chiếu trước/sau mutation; CAS-based write transaction chống xung đột; retry idempotent cho attempt/flashcard/authoring trả lại receipt gốc bất kể bài học bị unpublish; chặn tạo client-intent mới khi intent đang pending; scoped intent theo chủ sở hữu (owner-scoped) và dọn dẹp intent khi đăng xuất hoặc đổi tài khoản.
  - Sửa lỗi gating mutex (Finding F1/F2): `libsql-batch.ts` suy ra việc kích hoạt mutex cục bộ từ `resolveDatabaseConfig()`, chỉ bật trên SQLite file cục bộ (`file:`) và tắt trên Turso hosted (`APP_RUNTIME=vercel`); được bảo vệ bởi 4 test case hồi quy.
  - Lập kế hoạch nhân quả (P123): `p11-v1` và `CausalBasis` bổ sung mở rộng tương thích ngược với `p08-v1`. Invariant: kỹ năng yếu không có quan sát thực tế thuộc đúng skill tuyệt đối không sinh tuyên bố bằng chứng; matched refs / cited refs = 100%, foreign refs = 0. Planner GET hoàn toàn read-only (0 writes, 0 provider calls).
  - Kiểm tra hợp đồng orchestration nhiều lượt (P124): Bộ công cụ `npm run eval:learning` với bộ dữ liệu 12 ca nhiều lượt (4 Mission, 4 Coach, 4 Quest) chạy offline với provider tất định bao phủ 9 dạng lỗi/biên ngữ cảnh. Chạy offline 12/12 ca PASS (156/156 checks), bảo vệ file người dùng `eval/report.md`. Khung 5 tiêu chí chấm điểm chất lượng độc lập (Correctness, Level Fit, Actionable Hint, Contextual Relevance, Learner Retry) sẵn sàng cho reviewer đánh giá; chất lượng sư phạm thực tế thuộc gate live T115-02 và còn ⬜.
  - Khung thử nghiệm có kiểm soát (P125): Đặc tả [docs/PILOT_PROGRAM_SPEC.md](docs/PILOT_PROGRAM_SPEC.md) và công cụ `npm run pilot:analyze` phân tích cohort 5–8 người học người lớn có sự đồng thuận (consent), theo dõi 14 ngày (Baseline → Transfer → Delayed Retention); dữ liệu mẫu hiện tại là template tổng hợp, chưa tuyển người học thật.
  - Vận hành & bài tập khôi phục cục bộ (P126): Tài liệu [docs/RUNBOOK_INCIDENT.md](docs/RUNBOOK_INCIDENT.md) ứng phó 4 kịch bản sự cố; script `scripts/verify-backup-restore.ts` chứng minh bài tập sao lưu / khôi phục dữ liệu đạt 100% data fidelity trong phạm vi SQLite cục bộ với schema tổng hợp (bài tập khôi phục Turso thật trên hosted vẫn là điều kiện Go của P126 trước khi cutover).
  - Bộ kiểm thử toàn diện: Vitest unit/integration tests qua 93 files PASS (100%), 24/24 Playwright E2E tests PASS, 0 lỗi TypeScript, 0 lỗi ESLint (32 cảnh báo <= 33). Database `prisma/dev.db` được bảo toàn nguyên vẹn 100%.
- **Những gì KHÔNG claim (Explicit Non-claims):**
  - Không claim phiên bản 1.0.0 phát hành: Dự án giữ nguyên `current_version` là 0.5.0 theo bậc thang phiên bản trong Plan12 01-CONTRACTS; 1.0.0 chỉ được gắn sau khi mọi cổng Production đạt và người dùng phê duyệt cutover.
  - Không tuyên bố chấm điểm phát âm (pronunciation scoring) hay Speech-to-Text (STT) thời gian thực.
  - Không tuyên bố chứng chỉ CEFR hay hiệu quả học tập nhân quả (causal pedagogical efficacy) ngoài các số liệu pilot khả thi có sự đồng thuận.
  - Không cam kết SLA thời gian phản hồi của nhà cung cấp AI bên thứ ba khi xảy ra sự cố mạng diện rộng.
  - Các cổng CI remote và triển khai hosted (Vercel/Turso Production cutover) cần phê duyệt và thông tin xác thực từ người dùng trước khi kích hoạt.
- Boot found the brain (22:03 on 09-16) behind the working tree: uncommitted Plan11 P110–P112 WIP exists (migration `20260916120000_plan11_integrity_receipts`, write-transaction helper with process mutex, receipt v1/enrichment lease, ledger CAS/UNKNOWN, client-intent storage, teacher `clientRequestId`). Recorded in Plan11 decision log; no author inferred.
- Fresh on WIP: type-check FAIL (7), vitest 449/451 (T111-02 and T111-03/04 fail as test-design defects), eslint 8 errors/40 warnings, migration not applied to dev.db, gh unauthenticated. WIP is a candidate, not accepted.
- Add multi-file Plan12: Definition of Done D1–D6, single version ladder 0.6→1.0, P120 WIP qualification (new T111-02a/b, 03a/b, mutex decision, owner-scoped intents), P121 integrity close-out, P122 real CI + Preview gates, P123–P125 loop/eval/pilot ordering, P126 Go/No-Go, cutover, rollback drill, post-launch ops and handover.
- No app code/schema/dependency/version change, no migration on user DB, no commit/push, no hosted mutation, no provider call, no agent spawn. Pre-existing untracked files preserved.

## Unreleased — Worker review + Plan11 spec (2026-09-16; planning only)
- Audit available report/checkpoint/Plan01–10 handoffs against source `de28cab`; qualify Plan10 P102/P103/P106 completion and actual CI evidence rather than erase implementation history.
- Fresh437/437unit87files, type-check PASS, structural eval30/30+12/12; exact current review SQL on in-memory libSQL persists1losing log for changes[1,0]. Current teacher UI-shaped bodies fail actual Zod for missing clientRequestId; elapsed-time retry changes hashes.
- Add multi-file Plan11: learning/authoring integrity and UI retry, evidence handoff/CI/hosted gates, causal planner basis, actual multi-turn coaching/reviewer evaluation and consented transfer/retention pilot. Pilot segment/provider/budget remain user inputs.
- Synchronize brain current truth. No app code/schema/dependency/version change, current DB migration, live spend, deployment, hosted mutation or worker spawn in this review/planning turn. Existing user eval/report and untracked files preserved.

## Unreleased — Plan10 project review/spec, 2026-09-16
- Add a fresh project-wide review and worker-ready Plan10 spec package for supply-chain remediation, atomic/idempotent legacy learning mutations, authoring integrity, security/TTS boundaries, reproducible tooling/docs/CI and environment-labelled acceptance.
- Record current local evidence: 425/425 unit, type-check, lint 0 errors/33 warnings, standard build, Prisma validate/status with 8 migrations, isolated E2E 20/20, offline quality 30/30 + 12/12. Python sidecar tests are not claimed because host dependencies are missing.
- Record 8 high/0 critical npm advisories without changing dependencies or accepting runtime exposure. No app implementation, migration, deploy, secret, hosted DB or version change in this entry.

## Unreleased — Plan09 account email security, local accepted (2026-09-15; hosted mail evidence open)
- Add additive `emailVerifiedAt`, hashed one-time account-action tokens and durable feedback records. Credentials sign-in now requires the server-recorded email proof, while proxy/session claims reject pre-verification sessions.
- Add verification resend/confirm and password-reset request/confirm APIs, server-only Resend delivery, safe Vietnamese action emails, and verified-user feedback notification plus acknowledgement. Raw action tokens, mail keys and feedback text never enter logs or tracked config.
- Add login/register/recovery/verification/feedback pages, reset the synthetic E2E accounts to verified state, and preserve a generic request response for absent and existing email addresses.
- Local evidence: additive migration applied to local SQLite; 425/425 unit tests across 87 files; type-check; lint 0 errors with existing warnings; standard build; Prisma validate/status; isolated E2E 20/20. No Resend credential, Vercel write enable, Turso Preview mail proof, Production mutation, or release version claim is included.

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
