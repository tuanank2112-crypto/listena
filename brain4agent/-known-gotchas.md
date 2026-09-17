# Gotchas

## Đã xử lý
- HTTPS Auth.js dùng __Secure-authjs.session-token; getToken cần secureCookie và URL precedence đúng. Tests dùng token mã hóa thật/chunked.
- Câu intervention ngắn đúng bị provider coi thiếu chi tiết: normalize theo validator trước DTO/state/evidence/mastery.
- Auto-complete bỏ studyMinutes: shared finalizer trong transaction, retry không cộng đôi.
- correctCount/incorrectCount là delta, phải atomic increment.
- Intervention cần React key=id; flashcard queue không modulo vô hạn.
- Windows Prisma migrate deploy với file DB chưa tồn tại có thể báo Schema engine error rỗng: E2E tạo file rỗng trước migrate.
- Date.now khởi tạo timer trong effect, không render; event callback memoized để qua React lint.
- `complete` không được dùng số turn client để chứng minh học: chỉ learner-owned LearningEvidence mở được partial/success completion và cộng phút.
- Meter profile cũ có thể lệch SkillMastery của AI; learner-facing meter phải qua resolver adaptive-first, không thêm một luồng sync profile mới.
- Daily Quest recency chỉ là lịch sử stateJson đã validate của chính learner; malformed key phải bị bỏ qua và all-recent phải fallback authored deterministic.

## Còn backlog
- Plan10 review promotes legacy attempt/flashcard multi-write retry safety and teacher lesson graph atomicity to pre-release work; do not create synthetic LearningEvidence to hide these gaps.
- Historical pre-worker audit reported8high/0critical. Plan10 removed Kokoro/Transformers and upgraded patches; historical post-worker audit reports0runtime high/critical. Not rerun by post-worker review; resolved-tree evidence must retain timestamp/scope, no blanket ignore.
- Plan10 implemented ESM Vitest/coverage and root Prisma6config. Workflow exists; actual CI execution is unverified. Python test dependencies/boundary7tests were historically reported, not rerun by post-worker review.
- Current stack Next16.3.5, no selectable production mock, Vercel/Turso target and Cloudflare rollback asset. Historical reports may retain older config; use current package/code and root review.
- Render PostgreSQL không khớp SQLite schema/migration lock; chưa production ready.
- TTS auth/key/loopback boundary đã được Plan03 xử lý. Plan10 restricts speed1.0 and returns opaque sidecar errors; live voice behavior remains unverified.
- Legacy attempt/review/game chưa tạo unified LearningEvidence/memory; không tự tạo synthetic session để vá tạm.
- Legacy attempt/review now have batches/keys, but stale CAS/replay/client-body/mastery contracts remain defective; use Plan11 realDB gates, not historical completion summaries.
- Kokoro runtime/scripts/dependencies removed by Plan10; do not restore or download models incidentally.
- Reports have historical counts/status; current source and post-worker review2026-09-16 qualify previous acceptance.
- Upstream brain managed rules có path hoang: dùng project binding AGENTS, không sửa tay block. Bản local engine1.7.2, GitHub đã có1.7.3; không tự cập nhật global skills.

- Demo seed tạo course English 1 - Listening and Vocabulary nhưng một số learner page còn lọc TATQHP1 - SOLUTIONS Pre-Intermediate + title Bài ; kết quả trang trống dù DB có dữ liệu. Đã đồng bộ, cần tránh hard-code course/title khi query curriculum.
## Post-worker review 2026-09-16 — current acceptance qualification

- `executeAtomicLibSqlBatch` already commits when it returns. Checking CAS `changes=0` after the call cannot rollback an earlier ReviewLog INSERT; actual in-memory current-SQL probe yields[1,0], logs1. Assert before transaction commit or use an in-batch abort guard.
- Stable UUID is insufficient if retry recomputes elapsed time included in canonical hash. Current attempt/flashcard clients do this; freeze/persist full payload through retry/reload.
- Replay cannot use reviewedAt as dueAt or hard-code ease/repetition/accuracy. Store the committed result, not later mutable schedule.
- Teacher new-page bodies omit now-required clientRequestId; manual+AI schema reject. Authoring graph still writes course/vocab outside batch and settles success before graph.
- Worker exact-replay unit test catches conflict and accepts `toBeDefined`; mock CAS test checks throw without DB readback. Green437tests does not prove these missing invariants.
- CI configured is not CI executed; current remote run UNVERIFIED. Structural30/30quality tests the dataset, not generated tutor outputs. See [review](../docs/WORKER_REVIEW_2026-09-16.md) and [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md).

## Plan12 planning 2026-09-17 — brain drift and WIP qualification

- Não có thể lệch code trong cùng ngày: hot memory ghi "no implementation" lúc 22:03 nhưng WIP xuất hiện 22:40. Luôn chạy `git status`/`git diff --stat` khi boot và ghi `WIP:` vào ledger; không tin "chưa làm" nếu working tree bẩn.
- Đọc revision **trong** `transaction("write")` + write lock làm hai request đồng thời serialize và cùng hợp lệ; test kỳ vọng stale-CAS dưới concurrency thuần sẽ fail sai. Chứng minh CAS guard bằng fault-injection `rowsAffected=0`, chứng minh serialize bằng 2 log/revision +2.
- Attempt chỉ ghi VocabularyMastery khi có lỗi từ; câu trả lời đúng không đổi `revision`. Fixture "revision tăng mỗi attempt" là sai.
- Mutex tiến trình `txLockTail` trong `libsql-batch.ts` chỉ có tác dụng trong một process; trên Vercel multi-instance không chống race. Quyết định giữ/bỏ phải kèm số đo SQLITE_BUSY (Plan12 SPEC-P120 §3).
- `client-intent.ts` key chưa có ownerId và client tạo key mới khi body đổi dù intent cũ còn pending → nguy cơ replay chéo tài khoản/2 commit. Sửa trước T111-06.
- `prisma migrate status` báo pending trên dev.db là bình thường khi có migration WIP; CẤM tự `migrate dev/deploy` lên dev.db — chỉ trên fixture tạm hoặc khi user yêu cầu có backup.

## Root review 2026-09-17 — bẫy cấu hình và bẫy nghiệm thu

- `process.env.DATABASE_URL` KHÔNG phải nguồn chân lý về loại database. Hosted Turso resolve qua `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` và không đọc `DATABASE_URL` (`database-config.ts:111-133`). Mọi nhánh rẽ theo loại DB phải gọi `resolveDatabaseConfig()`, nếu không sẽ chạy nhánh local trên hosted. Đã xảy ra thật ở `isFileDatabase()`.
- Đo lường trong lúc phát triển không phải test hồi quy. Quyết định mutex được "đo" nhưng không có test, nên lỗi cấu hình lọt qua cả 484 test.
- Một hàm có unit test vẫn có thể là code chết. `clearOwnerIntents` xanh trong unit test nhưng không nơi nào trong ứng dụng gọi. Ô nghiệm thu nhắc tới hành vi sản phẩm thì phải kiểm ở tầng sản phẩm, không phải tầng hàm thuần.
- Bộ eval gọi orchestrator thật vẫn có thể chỉ kiểm hình dạng hợp đồng. Check "reply không rỗng, score trong [0,1], act thuộc enum" chạy với provider tất định KHÔNG đo chất lượng dạy; đừng gọi là kiểm định sư phạm.
- Version bump là hành vi phát hành, không phải bookkeeping. Không bump khi cổng môi trường tương ứng còn trống, kể cả khi local đã xanh hết.
