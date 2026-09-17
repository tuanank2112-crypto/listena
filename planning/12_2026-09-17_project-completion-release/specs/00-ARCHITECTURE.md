# 00 — Kiến trúc kế hoạch hoàn thiện (Plan12)

## Mục tiêu

Đưa ListenAI từ trạng thái "nhiều plan đã local-accepted, nhiều gate hosted/live/pilot còn mở" tới **một lần phát hành công khai 1.0.0 có bằng chứng**, theo đúng định hướng AI-native: mục tiêu → nhiệm vụ ngữ cảnh → câu trả lời → coaching → thử lại → evidence → bước tiếp theo có căn cứ.

Plan12 **không** thêm tính năng mới ngoài phạm vi Plan11 P114–P116 đã đặc tả. Nó là lớp điều phối: qualify WIP đang có, xếp thứ tự các gate còn mở của Plan07/09/10/11, bổ sung phần thiếu (định nghĩa hoàn thiện, bậc thang phiên bản, vận hành hậu phát hành, handover).

## Định nghĩa hoàn thiện (Definition of Done — DoD)

| ID | Mảng | Điều kiện đóng (phải có receipt theo 01-CONTRACTS) | Nguồn contract |
|---|---|---|---|
| D1 | Integrity mutation | Toàn bộ T111-* và T112-* ✅ local **và** CI; P102/P103/P106 requalified | Plan11 SPEC-P111, Plan12 P120/P121 |
| D2 | Hosted | Preview disabled all-table fingerprint ✅; Preview enabled window (retry/owner/mail/WAF/live-typed) ✅ và fence khôi phục; Production server disabled → enabled ✅; rollback drill ✅; Plan09 mail thật ✅ | Plan07 OPERATIONS/TESTING, Plan09 TESTING, Plan12 P122/P126 |
| D3 | Live AI có kiểm định | ≥1 lượt coaching live thành công trên hosted với provider được chọn (không phải typed-unavailable), **và** T115-02 reviewer thresholds đạt hoặc user ghi nhận waive tường minh | Plan11 SPEC-P115, Plan12 P124 |
| D4 | Next action nhân quả | T114-01/02 ✅; mọi consumer đọc `p11-v1` và `p08-v1` | Plan11 SPEC-P114, Plan12 P123 |
| D5 | Pilot đã đánh giá | T116-01 report nộp (kết quả có thể âm; DoD là "đã đánh giá trung thực", không phải "có tiến bộ") | Plan11 SPEC-P115 §Pilot, Plan12 P125 |
| D6 | Handover | README/docs/brain khớp release truth; runbook deploy/rollback/backup-restore/incident/cost-cap; `package.json` + `state.current_version` = 1.0.0; tag git | Plan12 P126, OPERATIONS |

Dự án chỉ được tuyên bố hoàn thiện khi **cả D1–D6** ✅ ở môi trường thật. Bất kỳ mảng nào UNVERIFIED → dự án ở trạng thái "release candidate", không phải hoàn thiện.

## Non-goals (vùng cấm phạm vi)

CẤM đưa vào Plan12 dù "tiện tay": speech/STT/pronunciation; streaming token; vector retrieval; mở rộng curriculum lớn; redesign UI/a11y toàn diện; global JWT revocation; multi-tenant/thanh toán; framework/agent mới; planner/memory thứ hai; thay đổi SM-2/scoring; Render/PostgreSQL. Lý do: không mảng nào trong số này sửa một gate D1–D6 còn mở, và mỗi mảng đều làm mờ nguồn gốc bằng chứng học tập đang cần đo. Muốn làm → plan riêng sau 1.0.0.

## Bất biến kiến trúc (kế thừa, không đàm phán lại)

- BẮT BUỘC server giữ validator, đáp án, grading/state/evidence/mastery, ownership; client không bao giờ nhận `acceptedAnswers`/`correctIndex`.
- BẮT BUỘC mọi mutation học tập thoả `(owner, clientKey, canonicalPayload) → một kết quả bền vững`; commit lỗi không được để lại hàng học tập không áp dụng.
- BẮT BUỘC GET/render không gọi provider, không ghi state.
- BẮT BUỘC provider unavailable là trạng thái typed; không mock runtime, không coaching giả.
- BẮT BUỘC phân biệt bằng chứng theo môi trường (local/CI/Preview/Production/live/reviewer/pilot) và giữ nguyên ngày/giờ gốc của bằng chứng lịch sử; "configured" ≠ "executed".
- BẮT BUỘC không reset/seed/migrate DB người dùng hoặc hosted trong test; E2E/integration dùng SQLite tạm.
- CẤM coi số test, deployment Ready, hay lời tự đánh giá của implementer là nghiệm thu.

## Quan hệ quyền hạn giữa các plan

| Plan | Quyền còn giữ | Plan12 làm gì với nó |
|---|---|---|
| Plan07 | Hosting/Turso/Vercel, final D1 export, Production, cutover, rollback | **Không đổi contract**; P122/P126 thực thi theo runbook Plan07 và ghi receipt vào ledger Plan12 + đánh dấu gate Plan07 |
| Plan09 | Mail Resend, verification/reset/feedback | Không đổi; P122 (Preview) và P126 (Production) đóng gate mail |
| Plan10 | Hardening đã implement; P102/P103/P106 qualified | P121 requalify và ghi vào Plan10 TESTING-ACCEPTANCE mục "Post-worker qualification" |
| Plan11 | Contract P110–P116 (receipt, write-tx, causal basis, eval, pilot) | **Nguồn contract chi tiết**; Plan12 chỉ sửa 2 test design (ghi ở Plan12 §Quyết định bị thay thế) và thêm contract bổ sung ở 01-CONTRACTS |

Xung đột giữa Plan12 và plan cũ → plan cũ thắng về **contract kỹ thuật**, Plan12 thắng về **thứ tự, version và định nghĩa hoàn thiện**.

## Trạng thái đầu vào đo được (2026-09-17)

| Kiểm tra | Kết quả | Ý nghĩa |
|---|---|---|
| Brain --check | exit 0, engine 1.7.2/template 1.4.0 | cấu trúc não OK |
| type-check | FAIL, 7 lỗi | WIP chưa biên dịch sạch |
| vitest | 449/451, 89 files, 2 FAIL | integration test design cần sửa |
| eslint | 8 lỗi / 40 cảnh báo | vượt baseline 0/33 |
| prisma migrate status | 10 migration, 1 pending trên dev.db | migration WIP chưa apply; **không apply** vào dev.db |
| gh auth | chưa đăng nhập | CI UNVERIFIED |
| build/E2E/Python/audit/coverage/eval | không chạy | giữ giá trị lịch sử Plan10 |

## Ma trận lỗi / hành vi caller (cấp kế hoạch)

| Tình huống | Hành vi bắt buộc |
|---|---|
| WP thiếu receipt hoặc receipt thiếu count/URL | gate UNVERIFIED, không PASS |
| Ứng viên đổi sau khi gate ✅ | chỉ vô hiệu gate bị ảnh hưởng, rerun case liên quan |
| User chưa cấp input (budget/consent/gh/phê duyệt) | làm hết phần local không phụ thuộc; WP phụ thuộc giữ ⬜ với lý do "chờ input" |
| Bằng chứng hosted lịch sử (Ready, 31 bảng) | giữ là lịch sử; không nâng thành bằng chứng mới |
| Pilot cho kết quả âm | vẫn đóng D5 (đã đánh giá); D6 release recommendation có thể là "không phát hành" |

## Router

Đọc 01-CONTRACTS → SPEC-P120 → SPEC-P121 → SPEC-P122 → SPEC-P123 → SPEC-P126 → OPERATIONS → TESTING-ACCEPTANCE. Khi cần contract kỹ thuật chi tiết, nhảy sang Plan11 specs tương ứng; khi cần runbook hosted, sang Plan07/09 OPERATIONS.
