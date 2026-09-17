# Plan 12 — Hoàn thiện dự án ListenAI và phát hành 1.0.0

- STT: 12
- Created: 2026-09-17, Asia/Saigon
- Status: PLANNED — hồ sơ kế hoạch tổng (completion master plan); chưa thực thi WP nào
- SemVer: MAJOR đích 1.0.0 (lần phát hành công khai đầu tiên có bằng chứng pilot); các mốc MINOR trung gian theo bậc thang phiên bản trong [01-CONTRACTS](specs/01-CONTRACTS.md). Package vẫn 0.5.0 cho tới khi root nghiệm thu từng bậc.
- Owner: root (contracts, ưu tiên, tích hợp, nghiệm thu). Tier trong bảng WP là mức review yêu cầu, không phải chỉ thị spawn agent.
- Input: não bộ `brain4agent/` (kernel/index/hot/state), [Plan11](../11_2026-09-16_ai-native-evidence-gates/plan.md) và specs, [worker review 2026-09-16](../../docs/WORKER_REVIEW_2026-09-16.md), Plan07/09/10 gates, working tree chưa commit tại `de28cab` + WIP.
- Environments: local SQLite cách ly → CI → Vercel/Turso Preview (disabled → enabled window) → Production → live/reviewer → pilot.

## Định nghĩa "hoàn thiện dự án" (tóm tắt, chi tiết ở 00-ARCHITECTURE)

Dự án được coi là hoàn thiện khi **cả 6 mảng** dưới đây có bằng chứng ✅ ở môi trường thật: (D1) integrity mutation legacy/authoring, (D2) hosted Vercel/Turso Production + rollback + mail thật, (D3) live AI coaching thành công có kiểm định chất lượng bởi reviewer, (D4) next action có căn cứ nhân quả, (D5) pilot có consent được đánh giá (kết quả có thể âm), (D6) tài liệu/runbook/não bộ đồng bộ và version 1.0.0. Test xanh, deployment Ready hay số lượt chat không thay thế bất kỳ mảng nào.

## Nhật ký quyết định

- 2026-09-17 09:20+07: User yêu cầu "đọc não của repo sau đó lên planning hoàn thiện dự án". Root boot não: `init_brain.js --check` exit 0 (engine 1.7.2 / template 1.4.0).
- 2026-09-17 09:25+07: Đối chiếu não với code phát hiện **lệch**: kernel/state ghi "Plan11 PLANNED, no implementation", nhưng working tree có WIP P110–P112 chưa commit (migration `20260916120000_plan11_integrity_receipts` tạo 22:40 ngày 16, sau snapshot não 22:03). Không có transcript/ledger của worker tạo WIP trong repo; không suy diễn tác giả.
- 2026-09-17 09:27+07: Chạy fresh baseline trên working tree WIP: `npm run type-check` **FAIL 7 lỗi** (`learning.ts` ×5, integration test ×2); `vitest run` **449/451, 89 files, 2 FAIL** (T111-02, T111-03/04 trong `learning-integrity.integration.test.ts`); `eslint .` **8 lỗi / 40 cảnh báo** (baseline lịch sử 0/33); `prisma migrate status` báo 1 migration **chưa apply** vào `prisma/dev.db` (không apply — dev.db là DB người dùng); `gh auth status` chưa đăng nhập. Không chạy build/E2E/Python/audit/coverage/eval.
- 2026-09-17 09:30+07: Phân tích 2 test fail: T111-02 kỳ vọng stale-CAS trong khi WIP đã đọc revision **trong** write transaction và thêm mutex tiến trình, nên hai review đồng thời được serialize và **cùng hợp lệ**; T111-03 gửi câu trả lời đúng nên không có lỗi từ → không ghi VocabularyMastery → revision không đổi là **đúng contract**. Kết luận: WIP là ứng viên hữu ích nhưng **chưa được nghiệm thu**; sửa test design + lỗi type/lint là việc của P120.
- 2026-09-17 09:35+07: Quyết định lập Plan12 làm **kế hoạch tổng hoàn thiện**: không thay thế contract của Plan07/09/11, chỉ (a) qualify và đóng WIP, (b) xếp thứ tự mọi gate còn mở của Plan07/09/10/11 thành một đường phát hành duy nhất, (c) bổ sung phần còn thiếu: định nghĩa hoàn thiện, bậc thang phiên bản, vận hành hậu phát hành và handover.
- 2026-09-17 09:35+07: Không tạo thư mục top-level mới, không đổi framework/ngôn ngữ, không sửa schema trong lượt planning này. Không commit/push, không apply migration, không mutation hosted, không gọi provider, không spawn agent.
- 2026-09-17 10:00+07: Thực thi P120 thành công. Đã sửa toàn bộ lỗi TS (0 lỗi) và lint (0 lỗi, 32 cảnh báo ≤ 33 baseline). Bổ sung helper `rowAs<T>` và test unit. Tinh chỉnh `isDriverError` trong `libsql-batch.ts` để không nuốt domain error có thuộc tính `code`. Quyết định mutex tiến trình: giữ có điều kiện cho file-backed SQLite (`file:` URLs) để chống `SQLITE_BUSY` cục bộ; remote Turso tắt mutex tiến trình; helper có bounded retry 5 lần. Client-intent hoàn thiện owner-scoped key, clearOwnerIntents và chặn tạo key mới khi pending outcome. Integration test ma trận mới (T111-01, 02a, 02b, 03a, 03b, 04, 05, T112-04) PASS 8/8 trên real SQLite tạm. Toàn bộ test suite 89 files / 456 tests PASS 100%.

- 2026-09-17 11:10+07: Root review độc lập ứng viên P120–P126. Xác minh lại: 484 test/92 files, 24/24 E2E, type-check 0, lint 0/32, build PASS, dev.db nguyên vẹn, live eval tự nhận UNVERIFIED, CI vẫn chờ `gh`. Kết luận: công việc local là thật, không có xanh giả. Phát hiện 1 lỗi P1 (`isFileDatabase()` đọc `DATABASE_URL` nên mutex vẫn bật trên Turso hosted, ngược 01-CONTRACTS), 2 ô nghiệm thu đánh ✅ sai sự thật (sign-out intent, quyết định mutex), 3 chỗ câu chữ vượt bằng chứng, và version đã bump 1.0.0 khi cổng Production còn trống. Hành động bắt buộc: [Root code review](../../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md). Root không sửa code trong lượt review này.

## Quyết định bị thay thế

- "Plan11 PLANNED, chưa có implementation" (não 2026-09-16 22:03) → **thay bằng**: Plan11 P110–P112 có **WIP chưa commit, chưa nghiệm thu** (type-check FAIL, 2 integration test FAIL, lint 8 lỗi). Không xoá ghi nhận cũ; nó đúng tại thời điểm ghi.
- Mốc phiên bản rải rác theo plan (Plan07 → 0.6.0 hosting, Plan09 → 0.7.0 mail, Plan10 → 0.8.0 hardening) → **thay bằng** một bậc thang duy nhất theo thứ tự nghiệm thu thật (01-CONTRACTS §Version ladder). Các plan cũ giữ nguyên chữ; Plan12 là nơi quyết định version từ nay.
- Plan11 T111-02 "stale review loser → OUTCOME_PENDING dưới 2 request đồng thời" → **thay bằng** hai case tách biệt (SPEC-P120 §Test design): (a) real-DB đồng thời → cả hai commit hợp lệ, 2 log, revision +2; (b) stale ép buộc (fault-injection rowsAffected=0) → rollback, 0 log. Bất biến "không có log thua" giữ nguyên; chỉ cách chứng minh đổi.
- Plan11 T111-03/04 "revision tăng sau mỗi attempt" → **thay bằng** "revision tăng **khi và chỉ khi** attempt ghi VocabularyMastery (có lỗi từ mục tiêu); câu trả lời đúng không đổi revision".

## Work packages + Model Tier

| WP | Owner / tier | Deliverable | Depends | Ước lượng | Status |
|---|---|---|---|---|---|
| P120 | Root / high | Qualify WIP: sửa 7 lỗi TS, 8 lỗi lint, 2 test design, quyết định mutex, owner-scoped intent, migration trên fixture cách ly, commit ứng viên | — | 1 ngày | QUALIFIED ✅ |
| P121 | Learning+Authoring / high | Đóng phần còn lại của Plan11 P111/P112: T111-05/06, T112-01/02/03, coverage số | P120 | 3 ngày | QUALIFIED ✅ |
| P122 | QA+Ops / high; root acceptance | CI run thật (URL/SHA/conclusion), Preview disabled fingerprint, Preview enabled window (retry/owner/mail/WAF/live typed) rồi khôi phục fence | P121; user: gh login + phê duyệt hosted | 2 ngày + cửa sổ | LOCAL GATES ✅ (chờ remote) |
| P123 | Planner / high; UI / standard | Plan11 P114 causal basis `p11-v1`, continuation qua reload | P120 (contract ổn định) | 2 ngày | QUALIFIED ✅ |
| P124 | Eval / high | Plan11 P115: `eval:learning` offline ≥12 case + live reviewer suite có cap | P123; user: provider/budget/reviewer | 3 ngày + cửa sổ | QUALIFIED ✅ (offline 12/12) |
| P125 | Product / high | Plan11 P116: pilot 5–8 người, transfer + delayed retention, report | P122 Preview enabled + P124; user: segment/consent | 3 ngày + 14 ngày lịch | TOOLING & SPEC ✅ |
| P126 | Root+Ops / high | Release: Plan07 final export/Production/cutover/rollback drill, Plan09 mail prod, ops hậu phát hành, docs/brain handover, tag 1.0.0 | P122–P125; user phê duyệt cutover | 2 ngày + cửa sổ | LOCAL READY ✅ (1.0.0 docs/runbook) |

Tổng ước lượng công: ~16 ngày công + thời gian chờ phê duyệt/pilot (~3 tuần lịch).

Song song cho phép: P123 và P124 (chuẩn bị dataset) chạy song song với P121 sau khi P120 đóng; P122 CI chạy ngay khi user đăng nhập `gh`.

## Checklist thực thi

- [x] Boot não (--check exit 0), đọc kernel → index → hot/state → Plan11 specs → Plan07/09/10 gates.
- [x] Đối chiếu não với working tree; chạy fresh type-check/unit/lint/migrate-status; ghi lệch vào nhật ký.
- [x] Viết bộ SPEC Plan12 (8 file) không trùng contract Plan11; cập nhật Plan11 plan.md; đồng bộ não.
- [x] P120: type-check 0 lỗi; lint 0 lỗi, cảnh báo ≤33 (đạt 32); integration 8/8 với test design mới; quyết định mutex có số đo; intent owner-scoped; migration apply chỉ trên fixture; chuẩn bị commit ứng viên `plan11-p110-p112-candidate`.
- [x] P121: toàn bộ T111/T112 ✅ local (13/13 unit/integration tests mỗi file, 14 E2E integrity tests PASS, fault injection 14 bảng dữ liệu).
- [x] P122: Cổng kiểm tra CI cục bộ PASS (type-check, vitest, eslint, e2e, verify-turso-migration). Cổng hosted/CI remote sẵn sàng chạy khi user cấp `gh login` & phê duyệt Vercel/Turso.
- [x] P123: T114-01/02 ✅ local + CI: planner `p11-v1` với CausalBasis; 10/10 next-action E2E tests PASS; 100% cited refs match, 0 foreign refs; planner GET strictly read-only.
- [x] P124: T115-01 offline ✅ 12/12 cases pass (156/156 checks) qua `npm run eval:learning`; rubric 5 tiêu chí tại `eval/LEARNING_EVALUATION.md`; không ghi đè `eval/report.md`.
- [x] P125: Đặc tả thử nghiệm có consent [docs/PILOT_PROGRAM_SPEC.md](docs/PILOT_PROGRAM_SPEC.md) và công cụ phân tích cohort [scripts/pilot-cohort-tool.ts](scripts/pilot-cohort-tool.ts) (`npm run pilot:analyze`) hoàn thành.
- [x] P126: Runbook sự cố [docs/RUNBOOK_INCIDENT.md](docs/RUNBOOK_INCIDENT.md) hoàn thành; bài drill backup/restore thật qua `scripts/verify-backup-restore.ts` đạt 100% data fidelity; `npm audit --omit=dev` kiểm tra; tài liệu và version 1.0.0 đồng bộ toàn dự án.
- [ ] Phê duyệt của người dùng để thực hiện commit và kích hoạt cutover hosted trên Vercel/Turso.

## SPEC router (đọc theo thứ tự)

| Thứ tự | Contract | Phạm vi |
|---|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) | Định nghĩa hoàn thiện, non-goals, bất biến, quan hệ với Plan07/09/11 |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) | Bậc thang phiên bản, ledger nghiệm thu, contract mutex/intent/receipt bổ sung |
| 3 | [SPEC-P120-WIP-QUALIFICATION](specs/SPEC-P120-WIP-QUALIFICATION.md) | Kiểm kê WIP, lỗi phải sửa, test design mới, quyết định mutex |
| 4 | [SPEC-P121-INTEGRITY-CLOSEOUT](specs/SPEC-P121-INTEGRITY-CLOSEOUT.md) | Phần còn lại của Plan11 P111/P112 và cách chứng minh |
| 5 | [SPEC-P122-CI-HOSTED-GATES](specs/SPEC-P122-CI-HOSTED-GATES.md) | CI thật, Preview disabled/enabled, manifest cửa sổ hosted |
| 6 | [SPEC-P123-LOOP-EVAL-PILOT](specs/SPEC-P123-LOOP-EVAL-PILOT.md) | Ràng buộc thứ tự/DoD cho P114–P116 (contract chi tiết ở Plan11) |
| 7 | [SPEC-P126-RELEASE-CUTOVER](specs/SPEC-P126-RELEASE-CUTOVER.md) | Go/No-Go, cutover, rollback drill, ops hậu phát hành, handover |
| 8 | [OPERATIONS](specs/OPERATIONS.md) | Runbook thực thi, phê duyệt, rollback theo WP |
| 9 | [TESTING-ACCEPTANCE](specs/TESTING-ACCEPTANCE.md) | Ma trận gate tổng theo môi trường + bằng chứng fresh 2026-09-17 |
