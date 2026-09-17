# Plan 11 — AI-native learning with verifiable evidence

- STT: 11
- Created: 2026-09-16, Asia/Saigon
- Status: IN PROGRESS (WIP, chưa nghiệm thu) — spec package complete; P110–P112 có implementation chưa commit trong working tree (phát hiện 2026-09-17), type-check/lint FAIL, 2 integration test FAIL; CI, hosted và pilot gates OPEN. Điều phối tiếp theo do [Plan12](../12_2026-09-17_project-completion-release/plan.md)
- SemVer: MINOR scope; target version deferred until Plan07 release sequence is settled; package remains 0.5.0
- Owner: root, contracts/integration/acceptance
- Input: [worker review](../../docs/WORKER_REVIEW_2026-09-16.md), source `de28cab70ce346f2a8e94ace323b0d9a78796c0c`
- Environments: isolated SQLite, CI; disposable Vercel/Turso Preview through Plan07/09; consented pilot

## Nhật ký quyết định

- 2026-09-16: User yêu cầu dùng não review toàn bộ report/quá trình worker rồi tiếp tục planning; tái khẳng định AI-native.
- 2026-09-16: Brain --check PASS; root đối chiếu report/commit với source. Không khởi chạy implementation worker hay thay đổi hosted.
- 2026-09-16: Fresh 437/437 unit, type-check, 30/30 structural eval + 12/12 dataset checks PASS. SQL/schema/hash probe phát hiện [1,0] batch vẫn lưu 1 log, teacher payload thiếu key và elapsed retry làm hash đổi.
- 2026-09-16: Reopen Plan10 acceptance scope P102/P103/P106; giữ các phần đã triển khai, không xóa lịch sử. CI chưa xác minh vì gh chưa authenticated.
- 2026-09-16: Chốt thứ tự integrity + UI trước write-enabled release; causal planner + live multi-turn quality trước pilot. Production cutover không phải điều kiện để viết local code hoặc chuẩn bị eval/pilot.
- 2026-09-16: Đã hỏi user nhóm pilot; tạm A1–A2 giao tiếp hằng ngày/10–15 phút. Provider/budget, consent/reviewer/recruitment còn là input trước execution tương ứng.
- 2026-09-16: Không tạo top-level folder, đổi framework/ngôn ngữ hay schema trong lượt planning. Reviewed project-intro/data architecture để sửa mô tả hiện trạng đã lệch.
- 2026-09-17 09:25+07: Root boot não phát hiện working tree có WIP P110–P112 **chưa commit** (migration `20260916120000_plan11_integrity_receipts` tạo 22:40 ngày 16, sau snapshot não 22:03): schema khớp P110 freeze; `withLibSqlWriteTransaction` + mutex tiến trình; receipt v1 + enrichment lease; ledger CAS/`UNKNOWN`/`LessonGraphIncompleteError`; client-intent sessionStorage; teacher page có `clientRequestId`. Không có transcript worker trong repo.
- 2026-09-17 09:27+07: Fresh trên WIP: type-check FAIL 7 lỗi; vitest 449/451 (FAIL T111-02, T111-03/04); eslint 8 lỗi/40 cảnh báo; migration WIP chưa apply vào dev.db (không apply). Hai test fail là lỗi thiết kế test (serialize hợp lệ; câu đúng không ghi mastery). WIP **chưa được nghiệm thu**; qualification chuyển sang Plan12 P120, phần còn lại P111/P112 → Plan12 P121; P113→P122; P114→P123; P115→P124; P116→P125.

## Quyết định bị thay thế

- Plan10 “all local & CI fully accepted” được thay bằng implemented, acceptance-qualified: P102/P103/P106 cần chứng minh lại; CI configured ≠ CI executed. Các log cũ giữ là báo cáo lịch sử.
- Quality 30/30 là structural dataset acceptance, không phải tutor-output/learning-quality acceptance. Không thay thế contract runner cũ bằng tuyên bố mạnh hơn.
- Không thay đổi quyền Plan07/09 với hosted migration, mail, final export/cutover/rollback. Không supersede Plan08 server grading/memory/planner foundations.
- 2026-09-17: "PLANNED, no implementation started" → thay bằng "WIP chưa commit, chưa nghiệm thu" (xem nhật ký). T111-02 (stale loser dưới 2 request đồng thời) và T111-03/04 (revision tăng mỗi attempt) được Plan12 SPEC-P120 thay bằng T111-02a/02b và T111-03a/03b/04; bất biến giữ nguyên, cách chứng minh đổi. Version/thứ tự phát hành do Plan12 quyết định.

## Work packages + Model Tier

Các tier dưới đây là mức độ review yêu cầu, không phải chỉ thị spawn agent. Root thực thi tuần tự trừ khi user cho phép delegation ở phiên triển khai.

| WP | Owner / tier | Files / deliverable | Depends | Status |
|---|---|---|---|---|
| P110 | Root / high | Contract/schema freeze, evidence ledger, status qualification | Review | ✅ planning; 🟡 WIP schema/migration khớp freeze, chưa commit (Plan12 P120) |
| P111 | Learning / high | learning service, mutation DTO/schema/client intents, real DB concurrency/fault/replay | P110 | 🟡 WIP: receipt/write-tx/CAS có; TS FAIL, 2 test FAIL, intent chưa owner-scoped (Plan12 P120/P121) |
| P112 | Authoring / high; UI / standard | lesson-authoring ledger/graph, teacher routes/new page, payload retry, opaque errors | P110; exclusive schema lock | 🟡 WIP: graph trong tx, ledger CAS, publish isTarget, opaque error có; fault matrix/E2E trang thật chưa (Plan12 P121) |
| P113 | QA / high; root acceptance | CI artifact, local integration, hosted dependency/ownership/retry/read-only proof | P111/P112 local; Plan07/09 for hosted | ⬜ |
| P114 | Planner / high; UI / standard | existing planner/decision/types/reasons; causal evidence + continuation | P111/P112 contracts stable | ⬜ |
| P115 | Eval / high | existing eval pipeline extension, multi-turn synthetic/reviewer/live artifacts | P114 for integrated acceptance; dataset prep independent | ⬜ |
| P116 | Product / high | consent/pilot protocol, transfer/retention analysis, release recommendation | P113 Preview + P115; user inputs | ⬜ |

## Checklist

- [x] Boot/read brain; review available reports/checkpoints/worker outputs against source.
- [x] Run bounded fresh baseline and in-memory SQL/schema/hash probe.
- [x] Write review and independent SPEC contracts; preserve pre-existing files.
- [x] Synchronize current brain/Plan10 qualification without erasing historical evidence.
- [x] P110 freeze schema/DTO (WIP migration khớp freeze; ghi bảng Attempt/ReviewLog; chưa apply dev.db) — nghiệm thu ở Plan12 P120.
- [ ] P111/P112 fixes and real DB failure/replay/concurrency acceptance.
- [ ] P113 reproducible CI run plus permitted disposable Preview evidence; restore fence.
- [ ] P114 causal recommendation and owned next-session continuation.
- [ ] P115 offline runtime + reviewer evaluation; budgeted live suite.
- [ ] Resolve user inputs: pilot segment, provider/budget, reviewers and participants/consent.
- [ ] P116 pilot with transfer/delayed retention; report attrition and limitations.
- [ ] Root verify all environment-specific gates; release/cutover remains Plan07 decision.

## SPEC router

| Order | Contract |
|---|---|
| 1 | [Architecture](specs/00-ARCHITECTURE.md) |
| 2 | [Contracts](specs/01-CONTRACTS.md) |
| 3 | [P111–112 Integrity](specs/SPEC-P111-INTEGRITY.md) |
| 4 | [P114 AI-native loop](specs/SPEC-P114-LEARNING-LOOP.md) |
| 5 | [P115–116 Evaluation/pilot](specs/SPEC-P115-EVALUATION-PILOT.md) |
| 6 | [Operations](specs/OPERATIONS.md) |
| 7 | [Testing/acceptance](specs/TESTING-ACCEPTANCE.md) |
