# ListenAI roadmap

## Trạng thái ngay lúc này (2026-09-17, sau root review)

Ứng viên P120–P126 đã tồn tại trong working tree nhưng **chưa commit**. Root xác minh độc lập: local thật sự xanh (484 test/92 files, 24/24 E2E, type-check 0, lint 0/32, build PASS). Còn **7 finding mở**, trong đó 1 lỗi P1 nằm trên đường hosted. Đọc [Root code review](../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md) trước khi viết code.

Thứ tự việc cho worker: commit ứng viên → F1 sửa `isFileDatabase` dùng `resolveDatabaseConfig` → F2 thêm 4 test mutex → F3 nối `clearOwnerIntents` vào đăng xuất → F4 bỏ fallback `anonymous` → F5/F6/F7 sửa câu chữ → hạ version về mức chưa phát hành.

Sau đó: D1 và D4 đạt ở local và chờ CI; D2, D3, D5 chờ đầu vào của user (đăng nhập `gh`, phê duyệt cửa sổ Preview và cutover, provider kèm hạn mức chi, đồng thuận pilot).

## Current master plan
[Plan12](../planning/12_2026-09-17_project-completion-release/plan.md), PLANNED 2026-09-17: hoàn thiện dự án tới 1.0.0 theo Definition of Done D1–D6 (integrity, hosted+rollback+mail, live AI có reviewer, causal next action, pilot đã đánh giá, handover). Contract kỹ thuật vẫn ở [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md); hosted/mail vẫn Plan07/09.

1. P120 qualify WIP P110–P112 đang có (chưa commit): sửa 7 lỗi TS, 8 lỗi lint, thay 2 test design (T111-02a/b, 03a/b), đo và quyết định mutex tiến trình, intent owner-scoped + pending-block, migration chỉ trên fixture; commit ứng viên khi user cho phép → 0.6.0 cùng CI.
2. P121 đóng phần còn lại Plan11 P111/P112: T111-05/06, T112-01/02/03 với fault-injection ở `tx.execute`, E2E trang thật, dispatch counter; requalify Plan10 P102/P103/P106.
3. P122 CI run thật (cần `gh` login) → Preview disabled all-table fingerprint → Preview enabled window có manifest/phê duyệt (retry 20/1, owner isolation, WAF, mail ×3, fence restored) → 0.7.0.
4. P123 causal `p11-v1` trong planner hiện có; P124 `eval:learning` offline ≥12 case + live reviewer suite có cap (cần provider/budget/reviewer) và ≥1 coaching live hosted → 0.8.0.
5. P125 pilot 5–8 người có consent, baseline → transfer → delayed 7 ngày, report trung thực → 0.9.0.
6. P126 Go/No-Go → Plan07 server disabled (export/import/verifier) → rollback drill → enabled + mail prod + smoke → ops hậu phát hành (restore drill, alert, cost cap, `docs/RUNBOOK_INCIDENT.md`) → docs/brain/version 1.0.0.

Ước lượng ~16 ngày công + ~3 tuần lịch chờ phê duyệt/pilot. Blocking inputs: provider/budget; segment/reviewer/consent; gh; phê duyệt cửa sổ hosted; phê duyệt cutover.

## Infrastructure authority and release
Plan07 giữ canonical staging/disposable clone, final D1 export, Production, cutover, rollback reconciliation-aware. Plan09 giữ mail thật. Version bump chỉ theo bậc thang Plan12 01-CONTRACTS, đủ 3 nơi (package.json, state.json, changelog). Package hiện 0.5.0.

## Existing foundation / historical evidence
Plan08 local 387 unit/20 E2E (reliability/intent/planner). Plan09 local 425/20. Plan10 historical 437/20/7 Python, P102/P103/P106 qualified 09-16. Plan11 spec + WIP chưa nghiệm thu. Plan03/04 local loop/evidence; Plan05/06 Cloudflare lịch sử. Không rebuild memory/calibration/orchestrator; không suy live provider từ key binding.

## Idea vault / outside 1.0.0
Speech/STT/pronunciation, streaming, curriculum lớn, vector retrieval, global JWT revocation, lint cleanup rộng, visual/a11y audit, multi-tenant/thanh toán, APM mới. Mỗi mục cần plan riêng sau 1.0.0; không mục nào thay thế việc quan sát chất lượng coaching và transfer.
