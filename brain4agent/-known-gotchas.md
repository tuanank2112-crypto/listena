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
- Gating mutex tiến trình (`shouldSerializeLocally`) dùng `resolveDatabaseConfig()`, chỉ bật trên SQLite file cục bộ (`file:`) và tắt trên hosted Turso (`runtime === "turso"`), được bảo vệ bởi 4 test case hồi quy (F1/F2).
- `clearOwnerIntents` được nối trực tiếp vào luồng đăng xuất (`handleAppSignOut`) và khi đổi tài khoản (`syncOwnerIntentLifecycle`) trong `src/components/app-shell.tsx`, có test unit 6/6 PASS (F3).
- Bỏ fallback `"anonymous"` ở 4 vị trí UI client/page, bảo đảm bất biến owner-scoped luôn tuyệt đối (F4).
- Version ladder tuân thủ nghiêm ngặt: `package.json` giữ ở `0.5.0` đồng bộ với `state.json.current_version`; 1.0.0 chỉ được gắn sau khi các cổng Production đạt và user phê duyệt cutover.

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

## Root review 2026-09-17 — bẫy cấu hình và bẫy nghiệm thu (Đã xử lý & kiểm định)

- `process.env.DATABASE_URL` KHÔNG phải nguồn chân lý về loại database. Hosted Turso resolve qua `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` và không đọc `DATABASE_URL` (`database-config.ts:111-133`). Mọi nhánh rẽ theo loại DB phải gọi `resolveDatabaseConfig()`, nếu không sẽ chạy nhánh local trên hosted. Đã xảy ra thật ở `isFileDatabase()`.
- Đo lường trong lúc phát triển không phải test hồi quy. Quyết định mutex được "đo" nhưng không có test, nên lỗi cấu hình lọt qua cả 484 test.
- Một hàm có unit test vẫn có thể là code chết. `clearOwnerIntents` xanh trong unit test nhưng không nơi nào trong ứng dụng gọi. Ô nghiệm thu nhắc tới hành vi sản phẩm thì phải kiểm ở tầng sản phẩm, không phải tầng hàm thuần.
- Bộ eval gọi orchestrator thật vẫn có thể chỉ kiểm hình dạng hợp đồng. Check "reply không rỗng, score trong [0,1], act thuộc enum" chạy với provider tất định KHÔNG đo chất lượng dạy; đừng gọi là kiểm định sư phạm.
- Version bump là hành vi phát hành, không phải bookkeeping. Không bump khi cổng môi trường tương ứng còn trống, kể cả khi local đã xanh hết.

## Root verify lan 2 — 2026-09-17

- `e2e/timeline.spec.ts:27` **flaky** khi chay full suite (1 fail / 3 lan), chay rieng luon pass. Truoc khi dung E2E lam cong chan phai on dinh case nay, dung retry mu.
- `prisma/dev.db` cua nguoi dung KHONG tu dong theo kip migration moi. Sau Plan11 no thieu `Attempt.resultJson`, `Attempt.enrichmentState`, `ReviewLog.resultJson`, nen chay app that se loi khi cham bai hoac on the du toan bo test xanh (test dung DB tam). Luon kiem `npx prisma migrate status` truoc khi test thu cong, va sao luu truoc khi apply.
- CI co the xac minh doc lap qua trang GitHub Actions bang WebFetch khi `gh` chua dang nhap. "Chua dang nhap gh" khong dong nghia "khong kiem duoc CI".

## Su co AI provider 2026-09-17 — model khong ton tai

- `KIRAAI_MODEL` phai la id CO THAT trong danh muc nha cung cap. `qwen3.8-flash-free` va `glm-5.3-flash-free` KHONG ton tai; provider tra 404 `model_not_found` va app do ve thong bao chung "Gia su AI hien chua san sang". Kiem bang `curl -H "Authorization: Bearer $KIRAAI_API_KEY" https://kiraai.vn/api/v1/models` truoc khi doi.
- Key hop le va base URL dung KHONG dam bao AI chay. Phai kiem rieng tung yeu to: /models cho biet auth+base URL, /chat/completions cho biet model.
- Toan bo test dung provider tat dinh nen khong bao gio cham danh muc model that. Suite xanh 100% van de lot loi cau hinh lam chet lo san pham. Can mot smoke that cham provider.
- App KHONG phan biet sai cau hinh (404 vinh vien) voi qua tai (429/503 tam thoi): cung mot thong bao. Nguoi dung thu lai vo han, nguoi van hanh khong biet minh cau hinh sai.
- `ling-3.0-flash-free` la model duy nhat vua free vua active (2026-09-17) nhung rate-limit gat: 3 lan goi lien tiep cho 429/200/200. Pilot phai dung model tra phi.
- CAM chay `npm run build` khi `next dev` dang chay: hong thu muc `.next` dung chung, cac route API long nhau tra 404 HTML du file ton tai. Sua: dung dev, `rm -rf .next`, chay lai.

## Deploy 2026-09-17

- Production tren Vercel CHUA co `TURSO_DATABASE_URL`/`APP_RUNTIME`. `resolveApplicationRuntime` fail-closed khi thay marker `VERCEL_*` ma thieu `APP_RUNTIME`, nen deploy prod se cho mot site loi moi request cham DB. Kiem `vercel env ls production` truoc khi deploy.
- Preview bat Deployment Protection (SSO) nen curl chi nhan redirect toi `vercel.com/sso-api`; khong smoke-test duoc bang dong lenh. Cong voi `MIGRATION_WRITE_MODE` disabled thi thao tac ghi (khoi tao phien AI) cung bi chan.
- `vercel env add` KHONG ghi de bien da ton tai; phai `vercel env rm` truoc roi moi add, va nho ca ban branch-scoped lan ban chung, neu khong Preview van giu gia tri cu.
- `vercel link` ghi `.env.local` (chi `VERCEL_OIDC_TOKEN`). File nay uu tien cao hon `.env` trong Next, nen kiem lai sau khi link keo theo bien la.
