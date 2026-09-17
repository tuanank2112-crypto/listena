# Review report và quá trình worker — 2026-09-16

## Kết luận

Giữ nền tảng Mission, Coach, Daily Quest, server grading, learner intent/memory và planner hiện có. Worker đã tạo nhiều thay đổi hữu ích, nhưng **chưa đủ bằng chứng nghiệm thu toàn bộ Plan10**: có lỗi concurrency/replay thật, UI authoring lệch API và một số gate được đánh dấu vượt bằng chứng. Chưa phát hiện P0 trong phạm vi đọc; có P1 phải xử lý trước public write-enable. Đây không phải penetration test hay xác nhận tình trạng Production.

AI-native phải được nghiệm thu bằng vòng **mục tiêu → nhiệm vụ → câu trả lời → coaching → thử lại → bằng chứng → bước tiếp theo**, với chất lượng phản hồi và chuyển giao sang tình huống mới. Số test, lượt chat và deployment Ready không chứng minh vòng học hiệu quả.

## Phạm vi và độ tin cậy

- Snapshot: `de28cab70ce346f2a8e94ace323b0d9a78796c0c`, branch `codex/vercel-turso-migration`; diff hiện có được giữ nguyên. Không sửa `eval/report.md`, `foo`, ``, backup DB.
- Đọc boot/kernel/index/hot memory, router và trạng thái Plan01–10; đối chiếu source/test/DDL/CI/eval và lịch sử commit. Brain engine 1.7.2/template 1.4.0 `--check` PASS.
- Bằng chứng mới: `npm test -- --reporter=dot` **437/437, 87 files, 13.00s**; `npm run type-check` exit 0; `npm run eval:quality -- --dry-run` **30/30 case contracts, 12/12 dataset checks**.
- Probe [source](../planning/11_2026-09-16_ai-native-evidence-gates/specs/evidence/review-probe.ts) chạy SQL lấy trực tiếp từ service trên libSQL **in-memory**, schema Zod thật và hàm hash thật. Chứng minh semantics SQL/schema/hash; không giả nhận đây là full service/HTTP/hosted concurrency proof.
- Build/lint/E2E/Python/coverage/audit và Turso/Vercel 11:43 là **báo cáo lịch sử** của Plan10, không được chạy lại/kiểm tra remote trong lượt này. `gh run list` không đọc được vì CLI chưa đăng nhập; CI run hiện **UNVERIFIED**, không kết luận CI thất bại.
- Không có transcript riêng, token/time ledger hoặc report riêng của từng worker trong repo. Có thể review sản phẩm bàn giao, checkpoint, spec và commit; không thể xác nhận toàn bộ lời nói/hành động nội bộ của worker hay suy diễn ai viết từng dòng.
- Không đổi app code/DDL/dependency/version, không migration local, không đọc secret, không gọi AI/mail thật, không mutation hosted, không spawn worker trong lượt review/planning.

## Router report và chuỗi thực thi

| Hồ sơ đã rà | Kết luận về bằng chứng / quá trình |
|---|---|
| `docs/PROJECT_REPORT.md` (08-17; follow-up 09-01/02) | Snapshot lịch sử. Các mô tả no tests, mock fallback, PostgreSQL/Render, Kokoro không còn là hiện trạng. Dùng code và checkpoint mới thay vì tái làm backlog đã giải quyết. |
| `docs/PROJECT_AUDIT_2026-09-07.md`, Plan01/02 | Ghi nhận định hướng AI-native, worker bị usage limit và root tiếp quản. Plan01 checklist còn cũ; không suy từ ô trống rằng mọi fix chưa làm. Eval 15-case đã được nâng qua orchestrator thật nhưng provider deterministic. |
| `docs/LEARNING_LOOP_REVIEW_2026-09-08.md`, `LEARNING_LOOP_CHECKPOINT_2026-09-08.md`, Plan03 | Pha dở → root sửa syntax/integration → local acceptance. Kết luận EPERM được thay thế bởi stale Next lock. Mục “not accepted/next steps” cũ phải đọc cùng final verification, không phục hồi task đã xong. |
| `docs/LEARNING_INTEGRITY_CHECKPOINT_2026-09-10.md`, Plan04 | Completion evidence, partial debrief và mastery display có scope local rõ. Legacy mutation backlog được chuyển Plan10; không trộn vào unified evidence. |
| Plan05/06 | Cloudflare/D1 là deployment lịch sử và rollback asset. Có binding provider không đồng nghĩa đã có successful live AI. |
| Plan07 | Canonical staging và bounded clone proof đã ghi nhận; hosted retry/owner/read-only fingerprint, final export/cutover/rollback còn mở. |
| `docs/PROJECT_REVIEW_2026-09-13.md`, Plan08 | Follow-up local supersedes planning-only status. Shared planner/intent/calibration đã có; phần live/pilot còn mở. |
| Plan09 | Token/email/account flow có local tests; inbox delivery và feedback mail thật chưa được chứng minh. |
| `docs/PROJECT_REVIEW_2026-09-16.md`, Plan10 | Review tại `0ce30e1` là trước implementation. Commit `788dae6` có code hardening; `6b7e173`/`de28cab` thêm hosted record. Post-worker review tìm thấy lệch hợp đồng P102/P103/P106 bên dưới. |
| `eval/report.md`, `eval/run.ts`, `eval/run2.ts` | Report hiện là 15/15, grounded 4/15 ngày 09-10. Provider deterministic; không phải live quality. `run2.ts` là runner phụ, không thêm bằng chứng độc lập. Không chạy runner ghi đè report đang dirty. |
| `eval/QUALITY_EVALUATION.md`, `quality-run.ts`, contract/cases | 30-case runner xác minh cấu trúc dataset/evidence policy; không chạy tutor trên từng case, không chấm câu trả lời AI hay tiến bộ người học. Versioned artifacts được ignore; cần lưu bằng chứng nghiệm thu bền vững ở CI/ledger. |

## Findings đối chiếu code

| ID / ưu tiên | Trigger và bằng chứng | Hành vi / tác động | Planning |
|---|---|---|---|
| W11-F01 **P1** | `learning.ts:683–686`: stale flashcard revision → batch INSERT log + UPDATE changes=0 → throw sau commit | Probe SQL thật: rowsAffected **[1,0]**, **1 ReviewLog đã lưu**, revision giữ 1, schedule giữ 2000. Log và lịch lệch; retry có thể replay log thua. Cần guard abort transaction trước commit. | P111 |
| W11-F02 **P1** | `flashcards-client.tsx:49`, `lesson-client.tsx:151`: giữ key nhưng tính elapsed time mới; hash service chứa thời gian | Probe hash thật: đổi `responseTimeMs` hoặc `completionTimeMs` → hash khác. Lost success response rồi retry thành 409 cùng key. Ref không sống qua reload. Cần giữ toàn bộ payload intent, không chỉ UUID. | P111/P112 |
| W11-F03 **P1** | `learning.ts:574–577`: replay dùng reviewedAt làm nextReviewAt, hard-code ease=2.5/repetitions=1; attempt replay:151–166 tạo accuracy=1 và feedback null | Replay không bằng kết quả gốc, có thể trình bày lịch/đánh giá học sai. Cần durable response snapshot hoặc reconstruct đầy đủ từ committed data, không lấy schedule hiện tại hay bịa giá trị. | P111 |
| W11-F04 **P1** | `learning.ts:215–236,295–320`: mastery tính từ profile trước batch rồi ghi tuyệt đối; unique conflict không được readback-map; attempt VocabularyMastery update:369–374 không bump revision | Hai distinct attempt có thể mất một mastery update dù counter tăng; same-key race loser trả generic 500 thay replay. Attempt còn có thể làm stale review snapshot mà revision không đổi. Source-level finding, chưa chạy full race fixture. | P111 |
| W11-F05 **P1** | `lesson-authoring.ts:194,212,327,508`: course/vocab ghi trước batch; ledger UPDATE chỉ lọc id/user; budget success trước graph; reserve read-then-create/update | Partial course/vocab khi batch fail; concurrent FAILED recovery không CAS; thiếu request status/lease fence; setup/quota failure ngoài catch để PENDING không hồi phục. Timeout bất định đang FAILED có thể gọi lại provider. Chưa có real DB fault/provider-call matrix chứng minh P103. | P112 |
| W11-F06 **P1 regression** | `teacher/lessons/new/page.tsx:32–36,59–63` thiếu clientRequestId; Zod bắt buộc ở schemas.ts:102,116 | Probe payload hiện tại: **cả manual và AI bị reject**, issue duy nhất clientRequestId với input hợp lệ còn lại. Source UI mới không được E2E authoring cover. | P112 |
| W11-F07 **P1 acceptance** | Plan10 ✅ CI chỉ trỏ workflow; matrix vẫn ⬜; P107 checked nhưng không có WP/spec/decision tương ứng; kernel/intro/data còn spec-only | Nghiệm thu không truy được từ contract → test/artifact/environment. Hosted schema/Ready record không chứng minh toàn bộ disabled read fingerprint, retry/ownership hay quyền thực thi lịch sử. Cần ledger và qualification, không xóa chứng cứ cũ. | P110/P113 |
| W11-F08 **P1 trước AI-native pilot** | `quality-run.ts::runOfflineQualityEvaluation` gọi `validateQualityDataset`, không gọi orchestrator/provider | 30/30 không phải 30 tutor outputs chất lượng. Chưa có live multi-turn coaching, retry/transfer/retention hoặc reviewer ratings. Đây là gate sản phẩm, không phải regression của dataset runner. | P115/P116 |
| W11-F09 **P2** | `planner.ts:76,128–147`: weak skill từ SkillMastery, evidenceRefs là 12 observations mới nhất mọi skill | Lý do về nghe có thể cite evidence chỉ về từ vựng; legacy attempt có thể tác động SkillMastery mà planner không có source ref hợp lệ. Cần causal refs hoặc lý do trung thực; không tự thêm legacy vào evidence chuẩn. | P114 |
| W11-F10 **P2** | `generate-lesson/route.ts` generic catch trả error.message; publish service đếm vocabulary tổng, không isTarget | Opaque-error và targetVocabulary precondition của P103/P104 chưa hoàn toàn khớp. Cần canary và publish fixture toàn non-target. | P112 |

Unit replay attempt ở `learning.test.ts:166–174` bắt `IdempotencyConflictError` và chỉ assert `toBeDefined()`: conflict cũng pass test mang tên exact replay. Flashcard collision test mock batch [1,0], chỉ assert throw, bỏ qua persisted log. Ownership 11/11 chứng minh route roles/owner qua mocks, **không chứng minh authoring transaction/provider at-most-once**. Không được nâng count test thành bằng chứng ngoài assertions.

## Quyết định sau review

1. Qualify Plan10 local completion; mở lại P102/P103/P106 cho finding trên. Dependency/TTS/tooling fix đã có được giữ, không phủ nhận toàn bộ công việc worker.
2. [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md): sửa integrity/UI → proof local/CI/hosted → causal next action → live coaching evaluation → pilot có consent. Local implementation có thể tiến hành trước cutover; hosted scope vẫn theo Plan07/09 và authorization thực tế.
3. Root giữ schema/types/priority/integration. Worker report phải có commit, paths, command exit/count, real DB readback, failure cases, environment và open gates. Không giao acceptance cho lời tự đánh giá của implementer.
4. AI-native không đòi mỗi GET phải gọi LLM. Server planner deterministic bảo vệ evidence/ownership; live AI dựng ngữ cảnh và coaching bên trong các guardrail. Không rewrite stack hay dựng planner/memory thứ hai.
5. Giả định pilot chưa chốt: người Việt A1–A2, giao tiếp hằng ngày, 10–15 phút. User được hỏi trong phiên; đây là assumption để viết spec, không phải quyết định được user xác nhận.

## Bằng chứng probe mới

```text
Command: npx tsx planning/11_2026-09-16_ai-native-evidence-gates/specs/evidence/review-probe.ts
Exit: 0; snapshot de28cab70ce346f2a8e94ace323b0d9a78796c0c
staleReview: rowsAffected=[1,0], persistedLogs=1, revision=1, nextReviewAt=2000
teacherUiPayload: aiAccepted=false, manualAccepted=false; issues=[clientRequestId]
retryHash: attemptChangesWithElapsedTime=true, reviewChangesWithElapsedTime=true
```

Probe có thể đổi kết quả sau implementation; kết quả trong review này là snapshot bất biến, không dùng probe lỗi cũ làm acceptance fix mới. Không claim damage đã xảy ra trên hosted DB.
