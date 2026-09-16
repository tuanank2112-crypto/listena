# ListenAI — project-wide review, 2026-09-16

## Kết luận

ListenAI giữ được lõi AI-native và các đường học mới có bằng chứng local tốt: Mission/Coach/Quest, server grading, learner memory, shared planner, private personalized lessons và adaptive games đều có contract/test đáng giữ. Không phát hiện P0 có thể tái hiện trong lượt rà soát này.

Rủi ro phát hành hiện nằm ở bốn biên khác: các mutation legacy chưa atomic/idempotent, authoring có thể để lại graph dở dang, dependency/ops truth đã lệch runtime, và hosted abuse controls chưa có bằng chứng. Vì vậy không cần rewrite learning loop; cần một đợt hardening có thứ tự trước khi mở write Production.

## Phạm vi và bằng chứng mới

- Source review tại commit `0ce30e1` trên branch `codex/vercel-turso-migration`. Giữ nguyên các thay đổi có trước: `eval/report.md`, `foo`, và file tên `` chứa thông báo CLI Turso. Không xóa, reset hay ghi đè chúng.
- Brain engine `1.7.2` / template `1.4.0` đạt `--check`; đọc kernel, index, state, Plan07, Plan09, project intro, data architecture, gotchas và local Next 16.3.3 docs.
- Fresh local checks ngày 2026-09-16: unit **425/425 qua 87 files**; type-check PASS; lint **0 errors / 33 warnings**; Next production build PASS; Prisma validate + migrate status PASS với 8 migrations; Playwright fresh-SQLite **20/20**; offline quality contract **30/30 cases + 12/12 dataset checks**.
- Python sidecar tests không chạy được trong Python host hiện tại vì chưa cài `fastapi`; lỗi xảy ra ở collection trước assertion. Đây là thiếu reproducible test environment, không phải bằng chứng ba test sidecar fail về logic.
- `npm audit --omit=dev --json` báo 8 advisory mức high, 0 critical. Phải phân biệt đường deploy và toolchain: Kokoro/HuggingFace vẫn là dependency production dù runtime không đăng ký; Next 16.3.3 kéo `sharp` cũ; Prisma/Wrangler findings chủ yếu nằm ở CLI/build/rollback toolchain.
- `npm outdated --json` cho thấy patch updates khả dụng, gồm Next/eslint-config-next 16.3.5 và Wrangler 4.132.0. Không dùng kết quả này để cho phép nâng major hàng loạt.
- Không chạy `npm run eval` vì `eval/report.md` đang có thay đổi người dùng; dùng `eval:quality -- --dry-run`. Không deploy, không đổi secret, không gọi mail/AI thật, không mutation Turso/D1/Vercel/Production.

## Những phần phải giữ

- Runtime local/Turso fail-closed và write fence trong `src/lib/database-config.ts`, `src/proxy.ts`.
- Atomic libSQL batches, typed database errors, session start idempotency, turn/evidence/mastery fences.
- Account token chỉ lưu SHA-256, one-time consumption, non-enumerating reset request và server-only Resend boundary.
- Adaptive game/private lesson validators ở server; planner/read paths không tự ghi.
- E2E database riêng và test-process-only OpenAI transport stub; production không có mock provider selector.

## Findings theo ưu tiên

| ID | Mức | Bằng chứng source / command | Tác động bắt buộc xử lý |
|---|---|---|---|
| R10-F01 | P1 | `src/server/services/learning.ts::submitAttempt` tạo Attempt, errors, profile, 4 skill rows, AI trace, flashcards và vocabulary mastery bằng nhiều lệnh; request không có client id | Retry/lỗi giữa chừng có thể nhân đôi attempt, phút học, mastery hoặc để graph một phần. Phải có `clientAttemptId`, replay contract và một core atomic commit. |
| R10-F02 | P1 | `reviewFlashcard` ghi ReviewLog trước rồi upsert mastery; request không có client id | Lost response/retry có thể tăng counter/lịch ôn hai lần; lỗi sau log làm log và schedule lệch. Phải atomic + idempotent. |
| R10-F03 | P1 | teacher manual/AI lesson routes tạo lesson rồi loop vocabulary/link ngoài transaction; AI path settle budget + trace trước graph cuối | Có thể tồn tại DRAFT thiếu vocabulary hoặc retry tạo lesson/AI call mới. Cần durable lesson-creation request và atomic content graph commit. |
| R10-F04 | P1 | npm audit: 8 high; `kokoro-js`/`@huggingface/transformers` chỉ còn legacy nhưng là direct production dependencies; Next 16.3.3 resolves vulnerable `sharp` line | Gỡ dependency không dùng khỏi deploy graph; nâng patch có kiểm chứng. CLI-only advisory phải có disposition, không được che bằng ignore chung. |
| R10-F05 | P1 hosted | Account token có cooldown 60 giây theo account, nhưng chưa có Vercel WAF evidence cho registration/login/account-action endpoints; TTS/feedback không có hosted abuse gate | Trước write-enable phải có một bounded WAF rule, quan sát log rồi chứng minh 429 và không ảnh hưởng auth hợp lệ. Không ghi raw IP vào DB/log. |
| R10-F06 | P2 | README nói Next 16.3.1, runtime mock/fallback và “chưa production”; code/memory nói 16.3.3, no runtime mock, Worker đã public và Vercel Preview có proof. `render.yaml`/Compose PostgreSQL không tương thích SQLite/Turso target | Worker dễ dùng sai runbook/target và có thể deploy cấu hình không hỗ trợ. Phải cập nhật truth hoặc quarantine/remove config lịch sử có giải thích. |
| R10-F07 | P2 | Vitest cảnh báo TS config loaded as CJS; Prisma cảnh báo `package.json#prisma` deprecated; coverage provider được cấu hình nhưng `@vitest/coverage-v8` không cài; không có CI | Baseline chỉ chạy thủ công, dễ drift. Cần ESM-safe config, `prisma.config.ts`, coverage dependency/threshold có baseline và CI trên DB cô lập. |
| R10-F08 | P2 | Sidecar nhận `speed` nhưng `Vieneu.infer` không dùng; cache key không có speed; exception text trả trực tiếp; top-level Python packages không pin và host thiếu test deps | API hứa semantics không có, cache sai nếu speed được hỗ trợ sau này, và lỗi có thể lộ nội bộ khi gọi trực tiếp sidecar. Phải fail honestly, pin/test environment và trả lỗi opaque. |
| R10-F09 | P2 | attempt/flashcard routes trả `error.message` cho generic 500; logger redaction chỉ liệt kê path top-level | Internal failure/ownership detail có thể ra response/log. Chuẩn hóa typed 4xx/5xx và recursive redaction; test không chứa token/password/endpoint. |
| R10-F10 | P2 | Các service lớn: learning 1517 dòng, personalized 1152, adaptive games 994; chưa có coverage gate hoặc screenshot/a11y audit toàn sản phẩm | Không chặn hardening hiện tại. Chỉ tách module khi thay đổi làm giảm ownership rõ ràng; a11y/UX visual audit là package riêng, không được tuyên bố bởi test hiện tại. |

## Quan hệ với kế hoạch đang mở

- Plan07 vẫn sở hữu final D1 export, Vercel Production, traffic cutover, rollback và hosted ownership/idempotency. Plan10 không cấp quyền thực hiện các thao tác này.
- Plan09 vẫn sở hữu Resend Preview/Production proof. Plan10 chỉ bổ sung dependency, abuse và integrity preconditions; không tự đánh dấu mail delivery thành đạt.
- Plan08 local learning-loop acceptance không bị phủ định. R10-F01/F02 là legacy attempt/flashcard paths đã được ghi là backlog, không phải regression của Mission/Coach/Quest.

## Quyết định

[Plan10](../planning/10_2026-09-16_release-readiness-hardening/plan.md) là spec package cho worker. Một schema/migration owner phải đi trước; các worker chỉ song song sau khi shared contract/file locks được freeze. Root/orchestrator kiểm diff và rerun gates; báo cáo “xong” của worker không phải nghiệm thu.

## Giới hạn review

Không có screenshot-based UX audit, penetration test, live inbox/provider smoke, hosted dependency scan, load test hay learner efficacy study. Test xanh chỉ chứng minh contract local được chạy; không chứng minh Production, bảo mật tuyệt đối hoặc hiệu quả học thật.
