# Plan 08 — AI-native self-learning, orchestrated improvement

- STT: 08
- Created: 2026-09-13 (Asia/Saigon)
- Status: IMPLEMENTED LOCALLY — P80–P85 local acceptance is recorded; Vercel/Turso Preview, Production, cutover/rollback, live AI and consented-pilot gates remain OPEN. This plan is not released or closed.
- Target: proposed 0.7.0 MINOR after Plan07 target0.6.0; current package remains0.5.0
- Owner: root orchestrator
- Environments: isolated local SQLite; disposable Vercel/Turso Preview; Production; consented learner pilot
- Input: [project review](../../docs/PROJECT_REVIEW_2026-09-13.md)

## Nhật ký quyết định

- 2026-09-13: User tái xác nhận repo tự học tiếng Anh AI-native và yêu cầu review + plan theo vai trò orchestrator. Lượt này chỉ tạo báo cáo/spec/memory, không thực thi sửa app.
- 2026-09-13: Giữ Mission/Coach/Quest, server grading, grounding, memory, atomic batches và calibration đã có. Reliability đi trước mở rộng sản phẩm.
- 2026-09-13: P81 là điều kiện bổ sung cho hosted acceptance Plan07; local implementation P82–P84 có thể phát triển sau contract freeze, nhưng release không vượt qua Plan07.
- 2026-09-13: Root sở hữu shared contracts/schema và bằng chứng tích hợp. Owner dưới đây là phân công dự kiến, không phải agent đã chạy.
- 2026-09-13: Các số trong acceptance là ngưỡng đề xuất trừ bảng baseline ghi rõ kết quả đã chạy; không coi mock eval là hiệu quả sư phạm.
- 2026-09-13: P80–P85 đã được tích hợp và nghiệm thu **local**: `npm test` 387/387 (78 files), type-check pass, lint exit 0 (34 warnings có từ trước), Prisma validate/generate pass, production build pass, E2E 20/20 trên SQLite sandbox cô lập mới, và quality eval offline 30/30 cases + 12/12 dataset checks. Không có thao tác hay claim Preview/Production/Turso/Vercel/live provider/pilot.
- 2026-09-13: Independent re-audit không tìm thấy P0/P1 trong reliability/learning loop local. Deferred P2: nếu Coach bị unpublish sau khi provider trả kết quả nhưng trước atomic commit, một provider reservation có thể đã bị dùng; atomic target fence vẫn trả `TARGET_UNAVAILABLE`, nên integrity/idempotency không bị phá vỡ. Đây không phải bằng chứng live-provider hoặc hosted acceptance.

## Quyết định bị thay thế

- Quyết định ngày 2026-09-13 rằng lượt này “chỉ tạo báo cáo/spec/memory, không thực thi sửa app” được **thay thế có mốc** bởi quyết định local implementation/acceptance ngày 2026-09-13 ở trên. Bản ghi review-only được giữ nguyên như lịch sử; thay thế này không đóng bất kỳ gate hosted/pilot nào.
- Dòng phân công “owner dự kiến, không phải agent đã chạy” là ngữ cảnh lịch sử của review. Local implementation đã được root tích hợp và kiểm chứng; bảng work package giữ vai trò/ownership, không phải một claim đóng gate hosted/pilot.
- Không thay thế target Vercel/Turso hoặc trạng thái Plan07. Bổ sung yêu cầu kiểm tra GET side effects trước khi công nhận read-only fence.
- Roadmap cũ chưa định thứ tự cho confidence UI, start idempotency và thống nhất planner: ưu tiên thực thi cải tiến nay theo package này. Không xóa lịch sử các Plan03–07 đã nghiệm thu local.
- Không mở rộng legacy evidence tùy ý: ngoại lệ mới chỉ cho typed adapters theo P83; không biến mọi activity thành evidence.

## Work packages + Model Tier

| WP | Owner dự kiến / tier | Vùng sở hữu | Phụ thuộc | Bàn giao | Trạng thái |
|---|---|---|---|---|
| P80 | Root / high | specs, shared types, schema/migration review, integration | Review | Contract freeze, decision log, file locks, acceptance ledger | ✅ local |
| P81 | Runtime / high | register, auth/proxy, recommendation route, start persistence, tests | P80 | F01–F04 + regression/fault/concurrency evidence | ✅ local |
| P82 | Learner-context / high; UI / standard | learner-intent API/memory, mastery DTO, calibration display | P80; shared memory lock | F05/F07; goal/settings + honest progress | ✅ local |
| P83 | Planner / high; UI / standard | daily-quest, next-action, dashboard/session CTAs, evidence adapter | P82 DTO; P81 start contract | F06; one consistent next step + retry-safe flow | ✅ local |
| P84 | Evaluation / standard with independent review | eval cases/rubrics, no existing report overwrite | P80; P83 integration for live results | F08; offline/live/pilot evidence separated | ✅ offline local; ⬜ live/pilot |
| P85 | QA / high; Root release owner | isolated E2E, hosted checklist, review report | P81–84; Plan07 hosting gates | Reproducible artifacts, no unresolved P1; release decision | ✅ local; ⬜ hosted/pilot |

## Checklist thực thi

- [x] Boot brain, verify source and review product direction.
- [x] Rerun baseline 293 tests / 67 files + type-check on 2026-09-13.
- [x] Produce review, spec package, dependency/ownership plan and memory checkpoint.
- [x] P80 freeze contracts against latest source; relevant local Next docs read before framework edits.
- [x] P81 reliability and independent local regression review.
- [x] P82 intent, calibration truth and correctly named counts.
- [x] P83 unified bounded planner and context-remediation flow.
- [x] P84 versioned offline quality suite; keep existing `eval/report.md` untouched.
- [ ] P84 live-provider quality suite and consented pilot readiness.
- [x] P85 local gates in a fresh isolated sandbox.
- [ ] P85 Preview + Production + Plan07 cutover/rollback + consented-pilot gates; no environment inferred from another.

## Router SPEC

| Thứ tự | Hợp đồng |
|---|---|
| 1 | [00-ARCHITECTURE](specs/00-ARCHITECTURE.md) |
| 2 | [01-CONTRACTS](specs/01-CONTRACTS.md) |
| 3 | [P81 Reliability](specs/SPEC-P81-RELIABILITY.md) |
| 4 | [P82 Learner intent and truth](specs/SPEC-P82-LEARNER-TRUTH.md) |
| 5 | [P83 Learning loop](specs/SPEC-P83-LEARNING-LOOP.md) |
| 6 | [OPERATIONS](specs/OPERATIONS.md) |
| 7 | [TESTING-ACCEPTANCE, including P84/P85](specs/TESTING-ACCEPTANCE.md) |
