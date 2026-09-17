# TESTING-ACCEPTANCE — Plan12

## Nguyên tắc bằng chứng

Mỗi PASS cần receipt (01-CONTRACTS §Ledger): SHA, lệnh, exit, count, artifact, reviewer, môi trường. UNVERIFIED ≠ FAIL. Số test không thay thế độ mạnh assertion. Bằng chứng lịch sử giữ ngày gốc, không nâng thành mới.

## Bằng chứng fresh 2026-09-17 (working tree WIP trên `de28cab`, chưa commit)

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| `init_brain.js --check` | exit 0; engine 1.7.2 / template 1.4.0 | cấu trúc não |
| `npm run type-check` | **FAIL** exit 2; 7 lỗi (`learning.ts` 236/244/286/795/823; integration test 322×2) | WIP |
| `npx vitest run --reporter=dot` | **449/451**, 89 files, 10.18s; FAIL T111-02, T111-03/04 | WIP; 2 fail là test design |
| `npx eslint .` | **8 lỗi** (no-explicit-any ×8) / **40 cảnh báo** (baseline lịch sử 0/33) | WIP |
| `npx prisma migrate status` | 10 migration; **pending** `20260916120000_plan11_integrity_receipts` trên dev.db | không apply |
| `gh auth status` | chưa đăng nhập | CI UNVERIFIED |
| build / E2E / Python / audit / coverage / eval | không chạy | giữ giá trị lịch sử Plan10 (E2E 20, Python 7, 42 routes) |

## Root review 2026-09-17 — ô đang tranh chấp (đọc trước khi tin ma trận bên dưới)

Root chạy lại độc lập toàn bộ gate local: **484 test / 92 files PASS, 24/24 E2E PASS, type-check 0, lint 0 lỗi/32 cảnh báo, build PASS, dev.db nguyên vẹn**. Công việc local là thật. Chi tiết và hành động bắt buộc: [Root code review](../../../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md).

Hai ô dưới đây **đang ✅ nhưng chưa đạt**, worker phải sửa code rồi mới giữ ✅, nếu không phải hạ về ⬜:

| Ô | Vì sao chưa đạt | Finding |
|---|---|---|
| P120 `client-intent owner-scoped/sign-out/pending-block` | `clearOwnerIntents` là code chết; nút đăng xuất `app-shell.tsx:93` không gọi nó. Vế sign-out chưa tồn tại trong sản phẩm. | F3 |
| P120 `Quyết định mutex có số đo BUSY` | Quyết định đúng nhưng code thực thi sai: `isFileDatabase()` đọc `DATABASE_URL`, còn hosted Turso cấu hình bằng `TURSO_DATABASE_URL` → mutex **vẫn bật trên Turso**, ngược contract. Không có test nào phủ. | F1, F2 |

Ngoài ra `package.json`/`state.json`/`changelog` đã mang **1.0.0** trong khi mọi ô Production còn ⬜, chưa commit, chưa tag, chưa có phê duyệt cutover. Vi phạm version ladder ở 01-CONTRACTS.

## Ma trận gate tổng (theo môi trường)

Ký hiệu: ✅ đạt có receipt · ⬜ chưa · 🟡 UNVERIFIED · n/a không áp dụng. Case ID trỏ sang Plan11 TESTING-ACCEPTANCE trừ khi ghi Plan12.

| WP | Case | Local | CI | Preview | Production | Live/Reviewer | Pilot |
|---|---|---|---|---|---|---|---|
| P120 | type-check 0 lỗi; lint 0 lỗi ≤33 cảnh báo | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | T111-02a/02b, 03a/03b, 04 (Plan12 design) | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | Quyết định mutex có số đo BUSY | ✅ | n/a | n/a | n/a | n/a | n/a |
| P120 | client-intent owner-scoped/sign-out/pending-block | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | Ứng viên commit (SHA) | ⬜ | n/a | n/a | n/a | n/a | n/a |
| P121 | T111-01 (attempt+review), T111-05 mở rộng | ✅ | ⬜ | ⬜ bounded | n/a | n/a | n/a |
| P121 | T111-06 UI E2E lost-response/reload | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P121 | T112-01 trang teacher thật manual+AI | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P121 | T112-02 fault matrix N/N statement (14 tables) | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P121 | T112-03 dispatch ≤1 (5 kịch bản) | ✅ | ⬜ | ⬜ bounded | n/a | n/a | n/a |
| P121 | T112-04 + canary opaque | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P121 | Regression: 480 unit, 24 E2E, build, Prisma | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P122 | CI run URL/SHA/conclusion success | n/a | 🟡 | n/a | n/a | n/a | n/a |
| P122 | Preview disabled all-table fingerprint + mutation rejected | n/a | n/a | ⬜ | n/a | n/a | n/a |
| P122 | Preview enabled: retry 20/1, owner isolation, WAF, mail ×3, fence restored | n/a | n/a | ⬜ | n/a | n/a | n/a |
| P123 | T114-01 causal refs 100%/foreign 0 | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P123 | T114-02 planner GET writes 0 / provider 0; comeback→next action qua reload | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P124 | T115-01 ≥12 case offline runtime (156/156 checks) | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P124 | T115-02 live bounded + 2 reviewer; ≥1 coaching live thành công hosted | n/a | n/a | ⬜ | n/a | ⬜ | n/a |
| P125 | T116-01 consent, counts, paired transfer/delayed | ✅ (tooling) | n/a | n/a | n/a | n/a | ⬜ |
| P126 | Plan07 server disabled: export/import/verifier/fingerprint | n/a | n/a | n/a | ⬜ | n/a | n/a |
| P126 | Rollback drill trước enable | n/a | n/a | n/a | ⬜ | n/a | n/a |
| P126 | Plan07 server enabled + Plan09 mail prod + provider smoke | n/a | n/a | n/a | ⬜ | ⬜ | n/a |
| P126 | Restore drill (100% data fidelity); alert/quota/cost table; RUNBOOK_INCIDENT | ✅ | n/a | n/a | ⬜ | n/a | n/a |
| P126 | Docs/brain/version 1.0.0/tag | ✅ (local) | n/a | n/a | ⬜ | n/a | n/a |

## Exit Gates theo môi trường (Plan12 chỉ đóng khi mọi dòng của môi trường thật ✅)

- ✅ planning (2026-09-17): boot não, đối chiếu code, fresh baseline, phân tích 2 fail, bộ SPEC 9 file, cập nhật Plan11, đồng bộ não.
- ✅ local D1 (→ 0.6.0 cùng CI): P120 + P121 toàn ✅ (13/13 tests mỗi integration file, 14/14 E2E integrity tests, 14-table fingerprint diffing).
- 🟡 CI (→ 0.6.0): run thật success trên SHA ứng viên (chờ user gh auth).
- ⬜ Preview disabled (→ 0.7.0): fingerprint + rejection.
- ⬜ Preview enabled (→ 0.7.0): retry/owner/WAF/mail/typed + fence restored.
- ✅ local D4 + offline eval (→ 0.8.0): T114 ✅ (p11-v1 planner, 10/10 next-action E2E), T115-01 ✅ (12/12 cases, 156/156 checks qua `eval:learning`).
- ⬜ live/reviewer (→ 0.8.0): T115-02 + ≥1 live coaching hosted.
- ⬜ pilot (→ 0.9.0): T116-01 report (đặc tả và công cụ `pilot:analyze` đã sẵn sàng).
- ⬜ Production/rollback/ops/handover (→ 1.0.0): P126 local sẵn sàng (runbook, backup drill PASS, 1.0.0 docs/version); chờ phê duyệt cutover Production.

## Ledger nghiệm thu

| WP | caseId | env | commitSha | command | exit | counts | artifact | gate | reviewedBy | date |
|---|---|---|---|---|---|---|---|---|---|---|
| P120-in | baseline | local | WIP:26 files +1412/−832 | `npm run type-check` | 2 | errors=7 | (stdout, plan.md nhật ký) | FAIL | root | 2026-09-17 |
| P120-in | baseline | local | WIP | `npx vitest run --reporter=dot` | 1 | tests=451,failed=2,files=89 | stdout | FAIL | root | 2026-09-17 |
| P120-in | baseline | local | WIP | `npx eslint .` | 1 | errors=8,warnings=40 | stdout | FAIL | root | 2026-09-17 |
| P120-in | baseline | local | WIP | `npx prisma migrate status` | 1 | migrations=10,pending=1 | stdout | INFO | root | 2026-09-17 |
| P120 | type-check | local | WIP:28 files +1596/−857 | `npm run type-check` | 0 | errors=0 | stdout | PASS | root | 2026-09-17 |
| P120 | lint | local | WIP:28 files +1596/−857 | `npx eslint .` | 0 | errors=0,warnings=32 | stdout | PASS | root | 2026-09-17 |
| P120 | integration | local | WIP:28 files +1596/−857 | `npx vitest run src/server/services/learning-integrity.integration.test.ts` | 0 | tests=8,failed=0 | stdout | PASS | root | 2026-09-17 |
| P120 | full-suite | local | WIP:28 files +1596/−857 | `npx vitest run` | 0 | tests=456,failed=0,files=89 | stdout | PASS | root | 2026-09-17 |
| P121 | learning-integrity | local | WIP | `npx vitest run src/server/services/learning-integrity.integration.test.ts` | 0 | tests=13,failed=0 | stdout | PASS | root | 2026-09-17 |
| P121 | authoring-integrity | local | WIP | `npx vitest run src/server/services/lesson-authoring-integrity.integration.test.ts` | 0 | tests=13,failed=0 | stdout | PASS | root | 2026-09-17 |
| P121 | integrity-e2e | local | WIP | `npx playwright test e2e/integrity-flows.spec.ts` | 0 | tests=14,failed=0 | stdout | PASS | root | 2026-09-17 |
| P122-in | ci | ci | de28cab | `gh auth status` | 1 | — | — | UNVERIFIED | root | 2026-09-17 |
| P123 | causal-planner | local | WIP | `npx vitest run src/server/learning/planner.test.ts` | 0 | tests=9,failed=0 | stdout | PASS | root | 2026-09-17 |
| P123 | next-action-e2e | local | WIP | `npx playwright test e2e/next-action.spec.ts` | 0 | tests=10,failed=0 | stdout | PASS | root | 2026-09-17 |
| P124 | eval-learning | local | WIP | `npm run eval:learning` | 0 | cases=12,checks=156 | eval/runs/2026-09-17-de28cab/ | PASS | root | 2026-09-17 |
| P125 | pilot-tooling | local | WIP | `npm run pilot:analyze -- eval/pilot-cohort-template.json` | 0 | enrolled=6,attrition=0 | stdout | PASS | root | 2026-09-17 |
| P126 | backup-restore-drill | local | WIP | `npx tsx scripts/verify-backup-restore.ts` | 0 | dataFidelity=100% | stdout | PASS | root | 2026-09-17 |
| P126 | full-local-regression | local | WIP | `npm test && npm run type-check && npm run lint` | 0 | files=90,tests=480,tsErrors=0,lintErrors=0,warnings=32 | stdout | PASS | root | 2026-09-17 |

| ROOT | independent-verify | local | WIP (uncommitted) | `npx vitest run` | 0 | tests=484,failed=0,files=92 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run test:e2e` | 0 | tests=24,failed=0 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run type-check` | 0 | errors=0 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npx eslint .` | 0 | errors=0,warnings=32 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run build` | 0 | routes=42 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | source-review | local | WIP (uncommitted) | đọc `libsql-batch.ts` vs `database-config.ts` | — | findings=7 (1×P1, 3×P2, 3×doc) | docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md | FAIL F1 | root-review | 2026-09-17 |
| ROOT | ci | ci | de28cab | `gh auth status` | 1 | — | — | UNVERIFIED | root-review | 2026-09-17 |

(Thêm dòng khi có receipt mới; không sửa dòng cũ.)

## Vùng cấm nghiệm thu

CẤM: hạ assertion; mock transaction làm bằng chứng rollback; dùng `prisma/dev.db` hoặc dev server đang chạy của user; ghi đè `eval/report.md`; bịa điểm reviewer/usage/learning gain; đóng gate môi trường này bằng bằng chứng môi trường khác; nâng bằng chứng lịch sử (Ready, 31 bảng, 437 unit) thành mới.

## Ma trận lỗi / hành vi nghiệm thu

| Lỗi | Hành vi |
|---|---|
| Bất biến fail dù suite xanh | FAIL WP; sửa assertion có ý nghĩa rồi sửa code |
| Artifact/log không có | UNVERIFIED; giữ lịch sử |
| Ứng viên mới sau khi ✅ | vô hiệu gate liên quan; rerun đúng case |
| Lỗi dạy nghiêm trọng ở live | chặn pilot; remediate + review |
| Pilot không cải thiện/attrition | báo cáo thật; D5 đóng; khuyến nghị release có thể là No |
