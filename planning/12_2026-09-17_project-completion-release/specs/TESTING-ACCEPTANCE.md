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

## Root review 2026-09-17 — xử lý findings F1–F7 (Đã hoàn thành)

Root chạy lại độc lập toàn bộ gate local: **484 test / 92 files PASS, 24/24 E2E PASS, type-check 0, lint 0 lỗi/32 cảnh báo, build PASS, dev.db nguyên vẹn**. Công việc local là thật. Chi tiết và hành động bắt buộc: [Root code review](../../../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md).

Các finding đã được xử lý và kiểm định:
- **F1 & F2 (P1 & P2):** `shouldSerializeLocally()` trong `src/lib/libsql-batch.ts` sử dụng `resolveDatabaseConfig()`, chỉ bật trên SQLite file cục bộ (`file:`) và tắt trên hosted Turso (`runtime === "turso"`). Bổ sung 4 unit test trong `src/lib/libsql-batch.test.ts` phủ đủ 4 trường hợp (relative file, absolute file, hosted Turso bypass, invalid/missing env -> false không throw).
- **F3 (P2):** Nối `clearOwnerIntents(userId)` trực tiếp vào luồng đăng xuất trong `src/components/app-shell.tsx` trước `signOut()`, theo dõi đổi `ownerId` trong `useEffect` (`syncOwnerIntentLifecycle`), và tạo bộ test `src/components/app-shell.test.tsx` (6 tests PASS) kiểm tra handler đăng xuất và chuyển tài khoản.
- **F4 (P3):** Bỏ toàn bộ fallback `"anonymous"` ở 4 vị trí: `flashcards-client.tsx`, `lessons/[lessonId]/page.tsx`, `lesson-client.tsx`, `teacher/lessons/new/page.tsx`. `userId` được đặt thành prop bắt buộc hoặc yêu cầu session hợp lệ trước khi gửi intent.
- **F5 & F6 & F7 (Doc):** Làm rõ mô tả trong changelog (kiểm thử hợp đồng orchestration offline với provider tất định; chất lượng dạy thực tế thuộc T115-02 live reviewer); giới hạn bài tập khôi phục trong phạm vi SQLite cục bộ; cập nhật counts trong ledger (`templateParticipants=6` với limitation synthetic).
- **Version ladder:** Hạ `package.json` về `0.5.0` (khớp với `state.json.current_version`), tiêu đề changelog định dạng ứng viên chưa phát hành theo đúng hợp đồng 01-CONTRACTS.

## Root verify lan 2 — 2026-09-17 (sau khi worker xu ly F1–F7)

Bay finding F1–F7 da duoc xu ly va root **xac minh lai tren HEAD `34d554a`**: 494 test/93 files PASS, type-check 0, lint 0 loi/32 canh bao, build PASS, E2E 24/24. CI duoc xac minh **doc lap qua web** (khong qua `gh`): CI #16 tren dung `34d554a` ket luan **success**. Bac 0.6.0 do do hop le theo version ladder.

Hai van de moi, khong phai loi logic:

| Van de | Chi tiet | Anh huong |
|---|---|---|
| E2E flaky | `e2e/timeline.spec.ts:27` fail 1 trong 3 lan chay full suite; chay rieng luon pass | Khong phai regression; can on dinh truoc khi dua vao E2E lam cong chan |
| `prisma/dev.db` lech schema | Migration `20260916120000_plan11_integrity_receipts` chua apply; thieu `Attempt.resultJson`, `Attempt.enrichmentState`, `ReviewLog.resultJson` | **Chan test thu cong**: cham bai va on the se loi database. Root bi chan quyen nen khong sao luu/apply duoc; can user tu chay |

## Ma tran gate tong (theo moi truong)

Ký hiệu: ✅ đạt có receipt · ⬜ chưa · 🟡 UNVERIFIED · n/a không áp dụng. Case ID trỏ sang Plan11 TESTING-ACCEPTANCE trừ khi ghi Plan12.

| WP | Case | Local | CI | Preview | Production | Live/Reviewer | Pilot |
|---|---|---|---|---|---|---|---|
| P120 | type-check 0 lỗi; lint 0 lỗi ≤33 cảnh báo | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | T111-02a/02b, 03a/03b, 04 (Plan12 design) | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | Quyết định mutex có số đo BUSY | ✅ | n/a | n/a | n/a | n/a | n/a |
| P120 | client-intent owner-scoped/sign-out/pending-block | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P120 | Ứng viên commit (SHA) | ✅ (9325ca2) | n/a | n/a | n/a | n/a | n/a |
| P121 | T111-01 (attempt+review), T111-05 mở rộng | ✅ | ⬜ | ⬜ bounded | n/a | n/a | n/a |
| P121 | T111-06 UI E2E lost-response/reload | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P121 | T112-01 trang teacher thật manual+AI | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P121 | T112-02 fault matrix N/N statement (14 tables) | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P121 | T112-03 dispatch ≤1 (5 kịch bản) | ✅ | ⬜ | ⬜ bounded | n/a | n/a | n/a |
| P121 | T112-04 + canary opaque | ✅ | ⬜ | ⬜ | n/a | n/a | n/a |
| P121 | Regression: 494 unit, 24 E2E, build, Prisma | ✅ | ⬜ | n/a | n/a | n/a | n/a |
| P122 | CI run URL/SHA/conclusion success | n/a | ✅ | n/a | n/a | n/a | n/a |
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
- ✅ CI (→ 0.6.0): run thật success trên SHA f408433 (15/15 steps pass, URL: https://github.com/tuanank2112-crypto/listena/actions/runs/35187260657).
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
| P125 | pilot-tooling | local | WIP | `npm run pilot:analyze -- eval/pilot-cohort-template.json` | 0 | templateParticipants=6,attrition=0 | limitations: "synthetic template, no real enrolment" | PASS | root | 2026-09-17 |
| P126 | backup-restore-drill | local | WIP | `npx tsx scripts/verify-backup-restore.ts` | 0 | dataFidelity=100% | stdout | PASS | root | 2026-09-17 |
| P126 | full-local-regression | local | WIP | `npm test && npm run type-check && npm run lint` | 0 | files=92,tests=484,tsErrors=0,lintErrors=0,warnings=32 | stdout | PASS | root | 2026-09-17 |

| ROOT | independent-verify | local | WIP (uncommitted) | `npx vitest run` | 0 | tests=484,failed=0,files=92 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run test:e2e` | 0 | tests=24,failed=0 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run type-check` | 0 | errors=0 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npx eslint .` | 0 | errors=0,warnings=32 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | independent-verify | local | WIP (uncommitted) | `npm run build` | 0 | routes=42 | stdout | PASS | root-review | 2026-09-17 |
| ROOT | source-review | local | WIP (uncommitted) | đọc `libsql-batch.ts` vs `database-config.ts` | — | findings=7 (1×P1, 3×P2, 3×doc) | docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md | FAIL F1 | root-review | 2026-09-17 |
| ROOT | ci | ci | de28cab | `gh auth status` | 1 | — | — | UNVERIFIED | root-review | 2026-09-17 |

| P120 | mutex-gating | local | 9325ca2+worktree | `npx vitest run src/lib/libsql-batch.test.ts` | 0 | tests=12,failed=0 | stdout | PASS | worker | 2026-09-17 |
| P120 | app-shell-signout | local | 9325ca2+worktree | `npx vitest run src/components/app-shell.test.tsx` | 0 | tests=6,failed=0 | stdout | PASS | worker | 2026-09-17 |
| P120 | type-check-clean | local | 9325ca2+worktree | `npm run type-check` | 0 | errors=0 | stdout | PASS | worker | 2026-09-17 |
| P120 | lint-clean | local | 9325ca2+worktree | `npx eslint .` | 0 | errors=0,warnings=32 | stdout | PASS | worker | 2026-09-17 |
| P120 | full-suite | local | 9325ca2+worktree | `npx vitest run` | 0 | tests=494,failed=0,files=93 | stdout | PASS | worker | 2026-09-17 |
| P121 | e2e-integrity | local | 9325ca2+worktree | `npm run test:e2e` | 0 | tests=24,failed=0 | stdout | PASS | worker | 2026-09-17 |
| P124 | eval-learning | local | 9325ca2+worktree | `npm run eval:learning` | 0 | cases=12,checks=156 | eval/runs/2026-09-17-9325ca2/ | PASS | worker | 2026-09-17 |
| P126 | next-build | local | 9325ca2+worktree | `npm run build` | 0 | routes=42 | stdout | PASS | worker | 2026-09-17 |
| P122 | ci-full-pipeline | ci | f4084333753a68316a27763775a58fc846490e6f | GitHub Actions workflow CI | 0 | steps=15,passed=15,allJobsPassed=true | https://github.com/tuanank2112-crypto/listena/actions/runs/35187260657 | PASS | root | 2026-09-17 |

| ROOT2 | verify-on-HEAD | local | 34d554a | `npx vitest run` | 0 | tests=494,failed=0,files=93 | stdout | PASS | root-review | 2026-09-17 |
| ROOT2 | verify-on-HEAD | local | 34d554a | `npm run type-check` | 0 | errors=0 | stdout | PASS | root-review | 2026-09-17 |
| ROOT2 | verify-on-HEAD | local | 34d554a | `npx eslint .` | 0 | errors=0,warnings=32 | stdout | PASS | root-review | 2026-09-17 |
| ROOT2 | verify-on-HEAD | local | 34d554a | `npm run build` | 0 | build ok | stdout | PASS | root-review | 2026-09-17 |
| ROOT2 | verify-on-HEAD | local | 34d554a | `npm run test:e2e` x3 | 0/1/0 | pass=24 hai lan, mot lan fail timeline.spec.ts | stdout | PASS with FLAKE | root-review | 2026-09-17 |
| ROOT2 | ci-independent | ci | 34d554a | WebFetch GitHub Actions CI #16 | — | conclusion=success, job Build/Lint/Test passed | github.com/tuanank2112-crypto/listena/actions | PASS | root-review | 2026-09-17 |
| ROOT2 | ci-independent | ci | f408433 | WebFetch GitHub Actions CI #15 | — | conclusion=success | actions/runs/35187260657 | PASS | root-review | 2026-09-17 |
| ROOT2 | local-db-drift | local | 34d554a | PRAGMA table_info tren prisma/dev.db | — | resultJson=false, enrichmentState=false | stdout | BLOCKER cho test thu cong | root-review | 2026-09-17 |

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
