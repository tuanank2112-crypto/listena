# Rà soát logic toàn repo — 2026-09-17 (tối)

- Snapshot: HEAD `3090415` + working tree gỡ Kira (chưa commit).
- Yêu cầu của user: "tôi chỉ dùng model trong Vyce thôi, kiraai bỏ đi. tôi cần check lại logic toàn bộ repo. có vẻ như trong não không đủ thông tin rồi."
- Phương pháp: root chia repo thành 6 phân hệ, mỗi phân hệ một agent đọc code **read-only** và báo cáo finding có `file:line` + kịch bản lỗi; root tự đọc lại code để kiểm chứng mọi finding P1 và các P2 quan trọng trước khi ghi vào đây. Không finding nào dưới đây đến từ tài liệu hay não; tất cả đến từ code thật.
- Trạng thái: **chỉ review + gỡ Kira**. Không sửa finding nào (chờ user chọn thứ tự). Không deploy, không commit.

## 0. Kiểm tra fresh (trước khi gỡ Kira)

| Kiểm tra | Kết quả |
|---|---|
| `init_brain.js --check` | exit 0 |
| `tsc --noEmit` | 0 lỗi |
| `eslint .` | 0 lỗi / 32 cảnh báo |
| `vitest run` (toàn bộ) | 2 file integration FAIL vì `beforeAll` hết 10s khi chạy song song; chạy riêng 13/13 PASS mỗi file |
| `npm audit --omit=dev` | 3 high: `deepmerge-ts <8` qua `prisma` CLI (không nằm trên request path) |
| `prisma migrate status` | dev.db thiếu `20260916120000_plan11_integrity_receipts` (đã biết; không apply) |
| Root | 2 file rỗng `auth`, `auth-wal` (15:16 17/09), untracked, không trong danh sách bảo tồn → rác |

Sau khi gỡ Kira: type-check 0 lỗi; vitest toàn bộ **94 file / 501 test PASS** (lần này 2 file integration không hết giờ); eslint 0 lỗi / 32 cảnh báo.

## 1. Gỡ Kira, chỉ còn Vyce (đã làm)

| Trước | Sau |
|---|---|
| `KiraChatCompletionsProvider` trong `kira-chat-completions-provider.ts` | `VyceChatCompletionsProvider` trong `src/server/ai/vyce-chat-completions-provider.ts` |
| Allowlist 2 endpoint (kiraai.vn/api/v1, vyceai.com/v1) | **Chỉ** `https://vyceai.com/v1` |
| `DEFAULT_MODEL = "ling-3.0-flash-free"` (model Kira) | `claude-sonnet-4-6` |
| `AI_PROVIDER=kira`, `KIRAAI_API_KEY/MODEL/BASE_URL` | `AI_PROVIDER=vyce`, `VYCE_API_KEY/VYCE_MODEL/VYCE_BASE_URL` |
| `providerName: "kira"` (ghi vào `AIInteraction.provider`) | `"vyce"` |

- Cấu hình cũ **không được ngầm chấp nhận**: `AI_PROVIDER=kira` hoặc còn `KIRAAI_API_KEY` → factory log lỗi "AI provider configuration is stale" và trả về không-cấu-hình (fail closed). Có test hồi quy trong `provider-config.test.ts`.
- `scripts/ai-doctor.ts` đọc `VYCE_*`, báo FAIL nếu còn biến cũ.
- Sửa kèm: `eval/learning-run.ts:262` trước đây đọc `KIRA_API_KEY` (biến chưa từng tồn tại) nên live mode luôn báo thiếu key; nay đọc `VYCE_API_KEY`.
- Đã cập nhật: `.env` local (đổi tên khoá, giữ giá trị), `.env.example`, README, `docs/RUNBOOK_INCIDENT.md`, `docs/PRODUCTION_CUTOVER_RUNBOOK.md`, não (kernel/index/gotchas/project-intro).
- **Việc user phải làm trước lần deploy kế tiếp:** trên Vercel (Production và Preview) `vercel env rm` 4 biến `AI_PROVIDER`, `KIRAAI_API_KEY`, `KIRAAI_MODEL`, `KIRAAI_BASE_URL`, rồi `vercel env add` `AI_PROVIDER=vyce`, `VYCE_API_KEY`, `VYCE_MODEL=claude-sonnet-4-6`, `VYCE_BASE_URL=https://vyceai.com/v1` (kiểu `encrypted`). Không đổi → mọi tính năng AI báo chưa sẵn sàng và log "stale".

## 2. Findings theo mức nghiêm trọng

Mức: **P1** = tính năng sản phẩm sai/chết hoặc lộ đáp án; **P2** = hành vi sai trong kịch bản thực tế; **P3** = nhỏ/nhất quán. "Root ✔" = root đã đọc lại code và xác nhận.

### P1

| # | Phân hệ | Vị trí | Vấn đề | Kịch bản |
|---|---|---|---|---|
| L1 | Legacy dictation | `src/server/services/learning.ts:315,322` | `spellingAccuracy` và `contentWordAccuracy` đã là phân số 0–1 (`src/core/assessment/engine.ts:273,294`) nhưng bị chia thêm cho 100 trước khi vào `updateMastery`. Root ✔ | Chép chính tả đúng 100% → attemptScore 0.01 → mastery spelling/vocab **giảm** sau mỗi lần làm đúng; sau ~15 lần đúng về 0. Giá trị này ghi vào `SkillMastery` và hiển thị ở `/api/learner/progress`. |
| L2 | Legacy lesson page | `scripts/import-dataset.ts:136-146` + `src/app/learner/lessons/[lessonId]/page.tsx:37` | Import ghi `answers`/`sourceAnswers` vào `Exercise.metadata`; trang học chỉ bỏ `correctAnswer`, chuyển nguyên `metadata` xuống client. Root ✔ | Học viên mở DevTools/RSC payload đọc đáp án mọi bài chính tả trước khi trả lời. Trái bất biến "hidden answers never reach client". |
| P1a | Personalized | `src/server/personalized-learning/service.ts:943-958` | SQL calibration **tăng một bậc CEFR mỗi lần attempt** khi đủ ngưỡng (≥2 skill, ≥12 evidence conf≥0.75, avg≥0.65); không có khóa "chỉ khi chuyển trạng thái". Root ✔ | Chơi 2 game (16 vòng, confidence 1.0) rồi làm 1 bài AI 5 câu đúng: A2→B1→B2→C1→C2 trong một bài. `estimatedCefrLevel` điều khiển prompt bài sau, game và recommendation. |
| S1 | Mission session | `src/server/learning/service.ts:1318-1323` (cần ≥1 evidence để complete), `:169-171,364` (start mới → ACTIVE_SESSION_EXISTS), client `session-player.tsx:150` không có ABANDON | Session ACTIVE chưa có evidence + AI hỏng (outage, misconfig, hết 40 lượt/ngày) → không lối thoát. Root ✔ | Turn 503, complete 409, start 409, dashboard luôn RESUME về session đó. Trái bất biến "học viên không bao giờ bị kẹt vì AI". |
| A1 | Auth | `src/app/api/account/password-reset/request/route.ts:272-297`, `verification/request/route.ts:394-422` | Thân/status giống nhau (202) nhưng email có tài khoản phải chờ tạo token + gọi Resend đồng bộ (timeout 12s) trước khi trả; email lạ trả ngay. | Đo độ trễ phân biệt email đã đăng ký. Kết hợp A3 (register trả 409 "Email đã được sử dụng") thì nỗ lực "opaque" của route này vô nghĩa. Xếp P1 vì là lỗ bảo mật trên production đang public. |

### P2

| # | Phân hệ | Vị trí | Vấn đề |
|---|---|---|---|
| AI1 | AI budget | `src/server/ai/request-budget.ts:18` (lease 30s), `src/server/learning/service.ts:104` (start lease 120s) vs provider 180s | Lease ngắn hơn call → gọi thứ hai được dispatch khi call một còn chạy: turn (t>30s) bị tính tiền + trừ quota 2 lần, loser fail CAS; start (t>120s) → winner bị đánh UNKNOWN, kết quả đã trả tiền bị vứt, học viên cần call thứ 3. Khi nâng 50s→180s chỉ resize `GENERATION_STALE_MS`, hai hằng này bị bỏ sót. |
| AI2 | Session start | `src/server/learning/service.ts:221-230,529-535` | `isKnownNoCallStartFailure` chỉ nhận 3 reason; `AIMisconfiguredError` (401/403/404/400) và `AIRateLimitedError` rơi vào nhánh UNKNOWN. Nhánh `knownStartFailure` xử lý `AI_MISCONFIGURED` (thêm ở c2e8f8c) **không bao giờ chạy tới**. Root ✔ | Model sai → học viên vẫn thấy "kết quả không rõ, bắt đầu phiên mới", mỗi click đốt thêm một reservation; Retry-After của 429 bị mất. |
| AI3 | Teacher AI | `src/server/services/lesson-authoring.ts:491-497` | `createAIProviderFromEnv()` và `reserveUserAICall()` chạy sau khi ledger đã PENDING nhưng ngoài try/catch → cooldown/daily-cap/không cấu hình làm row kẹt PENDING; trang teacher tái dùng `clientRequestId` 24h → 409 mãi. |
| AI4 | Teacher AI | `lesson-authoring.ts:74-80,139-145` | Lease PENDING hết hạn không bao giờ được thu hồi (không có PENDING→FAILED); `retryAfterSeconds` về 1s vĩnh viễn. |
| PL1 | Personalized | `src/server/personalized-learning/service.ts:154,166` (đã báo sáng nay) | Stale check dùng `createdAt`, không có `updatedAt`; row FAILED tái dùng bị coi stale ngay → generation thứ 2 ghi đè `generationKey`, generation 1 mất fence. `PERSONALIZED_LESSON_ACTIVE_WINDOW_MS` 90s lệch 210s. |
| PL2 | Personalized | `service.ts:410-418,842-864`; schema `@@unique([lessonId, clientAttemptId])` | Idempotency chỉ theo `clientAttemptId`; không có "đã trả lời" per exercise → nộp lại vô hạn với UUID mới, mỗi lần mint evidence confidence 1 và đẩy P1a. |
| G1 | Adaptive games | `src/server/adaptive-games/selector.ts:214-237` + pool `service.ts:888,910` orderBy lemma | Distractor lấy theo thứ tự pool sắp theo lemma → gần như cùng 2–4 nghĩa lặp mọi vòng; đáp án lộ bằng loại trừ. Root ✔ |
| L3 | Text normalize | `src/core/text/normalize.ts:40` `/[^\w\s']/g` | `\w` ASCII-only, NFKC không gập U+2019: "don’t" (iOS) → `don`,`t` → chấm sai ~54 thay vì 100, lại upsert `VocabularyItem` "don" toàn cục + tạo flashcard; mọi chữ có dấu (café, "thực đơn") bị xoá. |
| L4 | Legacy attempt | `src/server/services/learning.ts:177` | `if (exercise.lessonId !== params.lessonId) {}` **rỗng**; attempt ghi với `lessonId` client gửi → có thể ghi attempt vào lesson khác (kể cả DRAFT); mapping lỗi ở `api/attempt/route.ts:87` là dead code. Root ✔ |
| L5 | Flashcards | `learning.ts:466-486`; schema index không unique | Mỗi lần sai cùng từ tạo thêm 1 Flashcard; trang flashcards load mọi thẻ due (không `take`); rating 3 thẻ cùng `VocabularyMastery` trong 1 phút đẩy interval 1d→3d→8d. |
| L6 | Legacy attempt | `learning.ts:356-364,693-708` | Bài "open": attempt commit với `resultJson=null`, receipt ghi ở transaction 2; nếu bước 2 lỗi → row PENDING không receipt → replay 409 `LegacyResultUnavailableError` mãi, client giữ intent 24h. |
| A2 | Auth | `src/server/auth/config.ts:40-81` | Không throttle/lockout đăng nhập; chỉ bcrypt cost 12. Trên Vercel mỗi request là lambda mới → brute force song song. |
| A3 | Auth | `src/app/api/register/route.ts:108-114,168-173` | 409 "Email đã được sử dụng" → enumeration trực tiếp. |
| S2 | Mission session | `service.ts:186-195,436-448` + `start-contract.ts:15-43` | Lỗi non-AI sau claim (DB unavailable) không ghi gì → client lặp `START_IN_PROGRESS` ~2 phút tới khi lease 120s hết. |

### P3 (tóm tắt, đủ vị trí để sửa)

- **AI**: Retry-After fallback chết: `Number(null)=0` hợp lệ → 429 không header trả `retryAfterSeconds=1` thay vì 15 (`vyce-chat-completions-provider.ts` `parseRetryAfter`, và `openai-responses-provider.ts`). Mọi HTTP 400 bị xếp "sai cấu hình vĩnh viễn" (400 theo-request cũng thành "báo quản trị"). `generate-lesson/route.ts:60-68` gộp mọi `AIProviderError` thành 503 chung, mất Retry-After và thông điệp misconfig. Commit lesson graph lỗi sau khi có output AI → reservation không settle (`lesson-authoring.ts:557-584`).
- **Session**: 429/5xx/timeout lúc start gộp thành UNKNOWN (`service.ts:221-230`); `spec.audioText`/`placeholder` không qua kiểm rò đáp án (`tutor-orchestrator.ts:238-243`, `dto.ts:145-151`); events endpoint không giới hạn số row per session (PAUSE/RESUME mỗi lần đổi tab); `clientTurnId` có thể trùng namespace `ai:`/`event:` (`state.ts:42-48`); reducer coi ABANDONED là active (`reducer.ts:57,76`); phút học = wall-clock từ `startedAt` cap 120.
- **Personalized/planner**: `planner.ts:173` `Number(intent.revision)` luôn NaN → basis luôn "revision 1"; ranh giới ngày Daily Quest theo UTC (07:00 giờ VN); hai công thức mastery khác nhau trên cùng `SkillMastery` (games 0.18·Δ vs personalized 0.8/0.2·(1/difficulty)); pool game cắt 56 từ theo alphabet (`service.ts:888`); `/api/recommendation` đọc toàn bộ Attempt + LearningSession kèm evidence không `take`.
- **Legacy**: receipt replay trả `flashcardIds: []` vì stringify trước vòng push (`learning.ts:363,466`); EXTRA_WORD biến chữ học viên gõ thành `VocabularyItem` toàn cục tự tham chiếu (`learning.ts:194-210`); `lastAttemptMap` serialize cả `resultJson`/`normalizedExpected` xuống client dù không dùng.
- **Auth/teacher**: role đóng băng trong JWT 30 ngày, không re-read khi đổi role/xoá user (`config.ts:85-92`); trang teacher liệt kê lesson/course/số học viên của **mọi** teacher trong khi API 403 non-owner (`teacher/lessons/page.tsx:7`, `courses/page.tsx:7`, `dashboard/page.tsx:10-20`); PUT `/api/teacher/lesson` không validate body (`route.ts:111-119`), review/publish tự duyệt; TEACHER có thể ghi dữ liệu learner qua `/api/attempt`, `/api/flashcard`, `/api/learning-sessions`; không CSP/HSTS trong `next.config.ts`.
- **Vệ sinh/tài liệu**: 2 file rỗng `auth`, `auth-wal`; 2 integration test thiếu `hookTimeout`; Plan12 header vẫn "PLANNED / package 0.5.0"; `npm audit` 3 high ở prisma CLI.

### Tầng dữ liệu / runtime config / scripts vận hành

Agent này đã apply 10 migration lên một SQLite **tạm trong scratchpad** (không đụng `prisma/dev.db`) và diff kết quả với `schema.prisma` bằng script: **không có drift** (cột, nullability, default, index, FK onDelete, PK đều khớp; chỉ dư partial unique index và CHECK có chủ đích).

| # | Mức | Vị trí | Vấn đề |
|---|---|---|---|
| D1 | P2 | `src/server/services/learning.ts:262-283,505-535,693-707` | Attempt bài "open" commit với `resultJson=NULL` + lease 30s; replay khi lease hết chỉ ném `LegacyResultUnavailableError`, không có takeover/finalize → nếu process chết giữa hai bước (AI call tới 180s) thì `clientAttemptId` đó OUTCOME_PENDING mãi mãi. Finalize UPDATE bỏ qua `rowsAffected` (0 row vẫn log "processed"). Cùng gốc với L6. |
| D2 | P2 | `prisma/migrations/20260916000000_release_hardening_mutations/migration.sql:26-51` | Migration **không additive**: DROP + recreate `VocabularyMastery` chỉ để thêm `revision INTEGER NOT NULL DEFAULT 0` (một `ALTER TABLE ADD COLUMN` là đủ). Root ✔. Apply hosted bị ngắt giữa chừng → mất bảng SRS. Đã chạy trên production 16:30 (thành công) nên rủi ro còn lại là cho DB mới/rollback. |
| D3 | P2 | `scripts/verify-turso-migration.ts:21-109,950-964` | Verifier hard-code hợp đồng Plan07: đúng 27 bảng / 48 index / 45 FK; schema hiện 31 bảng, thêm partial unique index và FK → **mọi lần chạy đều exit 1**, operator sẽ bỏ qua verifier. Root ✔ (hằng 27/48/45 còn nguyên). |
| D4 | P3 | `scripts/verify-backup-restore.ts:219-247` | "Drill" tạo schema giả 4 bảng (có cột `ReviewLog.clientKey` không tồn tại), copy file trong tmpdir rồi in "PASSED (100% data fidelity)". Không đụng schema thật/migration/backup Turso → bằng chứng nghiệm thu P126 gây hiểu nhầm. Root ✔. |
| D5 | P3 | `src/server/services/lesson-authoring.ts:370-380` | Lỗi sau `withLibSqlWriteTransaction` ghi đè ledger thành UNKNOWN/FAILED không có guard `status='PENDING'` → tx đã commit nhưng mất response (hosted) thì row COMMITTED có `lessonId` bị lật thành FAILED. |
| D6 | P3 | `src/lib/libsql-batch.ts:40-58,104-115` | Mutex local chỉ bọc `withLibSqlWriteTransaction`; `executeAtomicLibSqlBatch` và Prisma write chạy trên connection khác, `batch()` không busy-retry → va chạm thành 503 ở local/E2E (có thể là gốc flake test). |
| D7 | P3 | `@libsql/client` sqlite3 transaction | Handle `Database` tạo per `client.transaction()` không được close tường minh (chỉ rollback), để GC — local/E2E. |
| D8 | P3 | `scripts/import-dataset.ts:103-116,152-156` | Ép `status: PUBLISHED` và ghi đè nội dung exercise mỗi lần chạy; dùng resolver app nên shell có `APP_RUNTIME=vercel + TURSO_*` sẽ ghi thẳng production, không có guard. |
| D9 | P3 | `.github/workflows/ci.yml:20` | `DATABASE_URL: "file:./prisma/dev.db"` được cả resolver app lẫn Prisma CLI hiểu tương đối với `prisma/` → `prisma/prisma/dev.db` (thư mục lồng này đã tồn tại ở local). Vô hại trong CI (E2E dùng DB tạm) nhưng cho thấy quy ước đường dẫn bị đọc sai. |

Đã kiểm và đúng ở tầng này: fail-closed config không có lỗ (mọi tổ hợp `VERCEL_*`/`APP_RUNTIME`/`TURSO_*` thiếu đều throw; không nơi nào đọc `DATABASE_URL`/`TURSO_*` ngoài resolver; proxy fence phủ mọi API write vì không có server action); timestamp `toLibSqlTimestamp` khớp byte với adapter Prisma; không gọi Prisma bên trong body transaction; mọi idempotency key có unique index thật; `DatabaseUnavailableError` không mang `cause`; logger redact token/secret/cookie; CI không có pipe che exit code; `e2e/setup.ts` từ chối DB ngoài `tmpdir/listena-e2e-*`.

## 3. Những gì đã kiểm và đúng

- Reservation AI là một INSERT có điều kiện (daily/lease/cooldown trong WHERE), settle là CAS; credential chỉ đi tới endpoint allowlist, `redirect: "manual"`, safety identifier băm, không đọc `message` upstream.
- Mission: mọi route `auth()` + owner-scoped; ledger start unique `(userId, clientStartId)`; `validatorJson` không vào include; INSERT learner-turn là fence CAS duy nhất, `applyTutorTurn` thuần nên turnCount/trust/evidence không double-apply; PARTIAL/COMPLETED nhất quán server–client; timestamp so bằng epoch/ISO UTC.
- Personalized/games/intent: mọi read/write có `userId`; `PersonalizedLessonContentSchema` tách `answer`/`feedbackVi` vào `validatorJson`; claim round game một statement có `clientAnswerId IS NULL`; intent CAS băm cả 4 cột; budget dùng cửa sổ trượt; planner GET read-only; SQL SM-2 mirror khớp `processReview`.
- Auth: token hành động 32 byte, SHA-256 at rest, single-use atomic, cooldown 60s bền; verification không bypass được (authorize ném trước khi mint JWT, proxy chặn token thiếu `isEmailVerified`); không open redirect; header email không inject được; Resend `redirect: "manual"`.
- Legacy: `Attempt @@unique([userId, clientAttemptId])`, `ReviewLog @@unique([userId, clientReviewId])`; SM-2 review atomic trong `withLibSqlWriteTransaction` với revision CAS; teacher CRUD owner-scoped + ADMIN; learner chỉ thấy PUBLISHED; TTS key chỉ ở server, sidecar lỗi có fallback.

## 4. Đề xuất thứ tự sửa (chờ user chọn)

1. **Chặn lộ đáp án + điểm sai**: L2 (strip `answers`/`sourceAnswers` khỏi metadata trước khi render), L1 (bỏ `/100`), L4 (validate lessonId), L3 (normalize Unicode + smart quote).
2. **Thoát kẹt & tính tiền đúng cho AI**: S1 (nút "kết thúc/huỷ phiên" + cho complete PARTIAL không evidence hoặc tự ABANDON), AI1 (lease ≥ 210s hoặc heartbeat), AI2 (route `AI_MISCONFIGURED`/`AI_RATE_LIMITED` vào FAILED có Retry-After), PL1, AI3/AI4.
3. **Adaptive đúng nghĩa**: P1a (chỉ đổi bậc khi chuyển trạng thái + cooldown thời gian), PL2 (một evidence per exercise), G1 (distractor ngẫu nhiên theo seed), hợp nhất công thức mastery.
4. **Bảo mật production**: A1 (gửi mail qua `after()`/outbox hoặc pad thời gian), A2 (throttle theo email+IP), A3 (register trả 202 + mail cả hai trường hợp), CSP/HSTS, role refresh.
5. **Vận hành**: D3 (cập nhật verifier theo schema 31 bảng), D4 (drill backup thật trên schema thật), D2 (ghi nhận migration không additive vào runbook rollback), D8 (guard hosted cho import).
6. P3 còn lại + vệ sinh + tài liệu (Plan12 header, hookTimeout, xoá `auth`/`auth-wal`).

Mọi mục ở 1–4 vượt "hotfix ≤1 ngày công" nên theo luật AGENTS.md cần một SPEC package mới (Plan13) trước khi thực thi.

## 5. Cập nhật 23:15 — trạng thái khắc phục

Toàn bộ findings trên đã được xử lý trong [Plan13](../planning/13_2026-09-17_logic-review-remediation/plan.md) và nghiệm thu local (type-check 0, eslint 0 lỗi, vitest 110 file/684 test, Playwright 32/32, build PASS, live smoke với Vyce thật). Bằng chứng theo gate ở [TESTING-ACCEPTANCE](../planning/13_2026-09-17_logic-review-remediation/specs/TESTING-ACCEPTANCE.md). Chưa commit, chưa deploy. Còn mở: CI, đổi env Vercel `VYCE_*`, precheck trùng attempt trước khi áp migration Plan13 lên production, cosmetic feedbackVi bài AI riêng, `npm audit` 3 high ở prisma CLI (cần prisma major).
