# ListenAI — review và định hướng cải tiến, 2026-09-13

## Kết luận

ListenAI đã có nền tảng tự học tiếng Anh AI-native, không chỉ là thư viện bài học gắn chatbot. Cần hoàn thiện độ tin cậy và nối các quyết định học tập thành một vòng thống nhất; không cần viết lại hệ thống hoặc thêm framework agent mới.

Định hướng user tái xác nhận ngày 2026-09-13: **AI dẫn dắt việc tự học; người học giữ quyền chọn mục tiêu, đổi hướng và kiểm soát dữ liệu.** Vòng sản phẩm: mục tiêu → nhiệm vụ phù hợp → phản hồi → coaching/sửa lỗi → thử lại → bằng chứng → bước tiếp theo. Mission, Coach và Daily Quest dẫn đường; lesson, game, quiz và flashcard phục vụ vòng này.

## Phạm vi và bằng chứng

- Review source tại commit `aa2021d39d76aba568d7b0c89214caf41f7c083f`, branch `codex/vercel-turso-migration`; kiểm tra auth, write fence, đăng ký, session/orchestrator, mastery/calibration, dashboard, recommendation, memory, eval và hồ sơ triển khai.
- Chạy lại 2026-09-13: `npm run test` **293/293, 67 files, 9.86s**; `npm run type-check` **exit 0**. Vitest cảnh báo config ESM/CommonJS về thay đổi loader tương lai; không phải lỗi test hiện tại. Provider logs trong tests là fixture, không phải live call.
- Build, lint và E2E 16/16 là bằng chứng **2026-09-12** trong Plan07, không chạy lại ở review này. Không đo coverage, không audit giao diện bằng screenshot, không kiểm tra lại hosting/live AI hôm nay.
- Giữ nguyên thay đổi có trước: `eval/report.md`, `foo` và file tên ký tự đặc biệt. Không chạy `npm run eval` vì harness ghi đè report đang sửa.
- Đây là review + kế hoạch, chưa sửa các lỗi dưới đây, chưa nâng version, chưa deploy/cutover.

## Những phần đáng giữ

- `src/server/ai/tutor-orchestrator.ts`: provider boundary, grounding, schema validation, hạn chế lộ đáp án; orchestration đã có, không cần dựng lại.
- `src/server/learning/service.ts`: atomic start graph, conditional turn commit, clientTurnId, memory concurrency fence, completion cần evidence. Chống trùng turn **không đồng nghĩa** chống trùng tạo session.
- `src/server/personalized-learning/calibration.ts`: calibration có sẵn (8/12 evidence, ít nhất 2 skills, confidence ≥0.75); cần đưa trạng thái này ra trải nghiệm nhất quán, không tạo cơ chế song song.
- Adaptive games và private lessons đã có server grading/ownership; memory và timeline đã tồn tại. Không gán các phần này thành “chưa làm”.
- Runtime Vercel/Turso có cấu hình fail-closed và giữ đường rollback Cloudflare; tình trạng triển khai vẫn phải đọc theo từng gate Plan07.

## Findings theo ưu tiên

P1 = cần xử lý trước khi nhận thêm write/đóng hosted acceptance; P2 = cần trước khi nghiệm thu trải nghiệm tự học AI-native. Các lỗi là kết luận source-level với điều kiện kích hoạt, không phải khẳng định đã xảy ra trên production.

| ID | Mức | Bằng chứng source tại snapshot | Tác động và hướng xử lý |
|---|---|---|---|
| F01 | P1 | `src/proxy.ts:38,51`: chỉ chặn POST/PUT/PATCH/DELETE; `src/app/api/recommendation/route.ts:10,78`: GET gọi recommendation.upsert | Request GET đã đăng nhập vẫn có thể ghi khi `MIGRATION_WRITE_MODE=disabled`. Đưa GET về read-only; audit toàn bộ GET/render có side effect. Test fingerprint mọi bảng app, không chỉ User. |
| F02 | P1 | `src/app/api/register/route.ts:36,45,59`: User, LearnerProfile, 6 SkillMastery được tạo bằng nhiều lệnh riêng | Lỗi giữa chuỗi để lại account thiếu dữ liệu; retry vướng email đã tồn tại. Commit account graph nguyên tử, map unique conflict, fault injection từng bước và concurrent registration. |
| F03 | P2 | `src/server/auth/config.ts:75` ưu tiên AUTH_SECRET; `src/proxy.ts:70` ưu tiên NEXTAUTH_SECRET | Khi cả hai khác nhau, ký JWT và giải JWT dùng secret khác → đăng nhập rồi bị trả về login. Dùng chung resolver, kiểm tra cả tổ hợp env; không đọc hoặc in giá trị secret thật. |
| F04 | P1 | `src/server/validation/learning-session.ts:28`: create không có request key; `src/server/learning/service.ts:103`: randomUUID mỗi lần; `src/features/learning-session/start-session-button.tsx`: chỉ khóa nút local | Response tạo session bị mất rồi retry có thể tạo session/AI call mới. Budget hạn chế concurrency không deduplicate một lần bắt đầu đã hoàn tất. Thêm durable idempotency cho start; giữ nguyên turn idempotency. Không hứa exactly-once đối với provider bên ngoài. |
| F05 | P2 | `src/app/api/register/route.ts:63,64`: score0.5/evidence0; `src/server/learning/mastery-display.ts:3,47`: bỏ evidenceCount, fallback0.5; `src/app/learner/dashboard/dashboard-client.tsx:11,72`: hiển thị “Năng lực 50%” | Giá trị khởi tạo được trình bày như năng lực đo được. Hiển thị “Chưa đủ dữ liệu”/“Đang hiệu chỉnh”; score phải đi kèm evidence và phạm vi, không coi CEFR nội bộ là chứng chỉ. |
| F06 | P2 | `src/server/ai/daily-quest.ts:14,42`: preferredTopics nhận nhưng không dùng; `src/app/learner/dashboard/page.tsx:42,58`: lesson gần nhất hoặc alphabet; `src/server/learning/next-action.ts:15`: chỉ query LearningEvidence | Ba đường chọn hoạt động chưa thống nhất theo mục tiêu/ngữ cảnh. AdaptiveEvidence có thể tác động gián tiếp qua mastery nhưng không được cite trực tiếp ở next-action; learner chỉ chơi game có thể chưa có next-action ở đường này. Dùng chung planner có provenance, mục tiêu/thời gian, history và evidence adapter. |
| F07 | P2 | `src/app/learner/dashboard/page.tsx:21`: take4; `src/app/learner/dashboard/dashboard-client.tsx:74`: recentAttempts.length là “Lượt học” | Con số tối đa4 và chỉ tính legacy attempts, không đại diện tổng hoạt động. Đổi nhãn thành “Bài luyện gần đây” nếu giữ dữ liệu này; tổng hoạt động phải có query và contract riêng. |
| F08 | P2 | `eval/run.ts:6,38,51,57,60`: deterministic mock; kiểm phase và grounded boolean; Plan07 vẫn mở live-success gate | Test orchestration tốt nhưng không đo correctness phản hồi, thích ứng, transfer/retention hay AI hosted thành công. Tách regression offline, live integration có giới hạn và rubric sư phạm/người học. |

## Quyết định sản phẩm và thứ tự thực thi

1. Sửa F01–F04, xác minh lại các write/ownership gates trên clone. F03 tuy có điều kiện cấu hình nhưng nhỏ và thuộc auth nên ghép cùng đợt.
2. Cho người học khai báo mục tiêu/thời gian/sở thích và chỉnh lại được; dùng calibration hiện có, thể hiện trung thực trạng thái chưa biết. Không buộc làm bài kiểm tra dài trước khi được học.
3. Một primary action: tiếp tục phiên đang học, hoặc hoạt động được planner chọn kèm lý do. Sửa lỗi trong ngữ cảnh, rồi thử lại và đặt bước ôn phù hợp. Cho phép người học đổi lựa chọn; tránh mở nhiều phiên ngoài ý muốn.
4. Nối bằng chứng session và adaptive game/private lesson bằng nguồn có kiểu, không tạo session giả/backfill score giả. Legacy flashcard tự đánh giá không được nâng thành server-scored evidence.
5. Đo chất lượng AI thực và pilot tự học có pre/post + delayed transfer trước khi tuyên bố hiệu quả. Token, chat count, streak không thay cho tiến bộ học tập.

Không ưu tiên hiện tại: rewrite stack, vector DB mới, nhiều AI agent tự quyết định điểm, STT/pronunciation, mở rộng catalog hàng loạt, polish landing trước lỗi dữ liệu. Các mục này không giải quyết các khoảng trống đã chứng minh ở trên.

## Điều phối

[Plan08](../planning/08_2026-09-13_ai-native-self-learning/plan.md) là bộ spec cải tiến **PLANNED**, có owner, phụ thuộc, vùng file, tiêu chí bàn giao và local/hosted/pilot gates. Orchestrator giữ contracts, duyệt tích hợp và chịu trách nhiệm bằng chứng cuối; không chỉ chia task rồi tổng hợp lời báo “xong”. Không agent triển khai nào được khởi chạy trong lượt review này.

[Plan07](../planning/07_2026-09-10_vercel-turso-migration/plan.md) vẫn là kế hoạch hạ tầng đang thực thi. Bằng chứng cũ về registration fence không bị xóa, nhưng **không đủ để kết luận toàn bộ disabled-window không ghi** sau F01. Chỉ đóng migration/release khi đầy đủ hosted gates; review này không tạo quyền mới để đổi DB/DNS/production.

## Implementation follow-up — local only, 2026-09-13

Phần review ở trên là snapshot lịch sử tại `aa2021d39d76aba568d7b0c89214caf41f7c083f`. Kể từ snapshot đó, Plan08 đã được triển khai và nghiệm thu **trong local sandbox**; đây không phải tuyên bố deploy hay release.

| Finding gốc | Trạng thái local sau triển khai |
|---|---|
| F01 | `GET /api/recommendation` đã là read-only. E2E fingerprint toàn bộ bảng ứng dụng xác nhận request không đổi dữ liệu. |
| F02 | Đăng ký tạo User, LearnerProfile và 6 SkillMastery trong một transaction nguyên tử. |
| F03 | Auth và proxy dùng cùng secret resolver, có test cho các tổ hợp cấu hình mà không đọc/in secret. |
| F04 | Start session có durable idempotency key, replay/conflict contract và lease `PENDING` theo user trước khi gọi provider; active-session conflict được trả typed và UI dẫn về dashboard. |
| F05 | Learner intent có API/CAS revision; mastery hiển thị “chưa đủ dữ liệu” khi chưa có evidence thay vì biến giá trị khởi tạo thành năng lực thật. |
| F06 | Planner server-side hợp nhất next action, có provenance, Daily Quest được pin `scenarioKey`, giới hạn thời lượng và fallback trung thực sang lựa chọn Mission thủ công. |
| F07 | Số liệu dashboard được đặt tên theo dữ liệu thật, không còn trình bày `take(4)` legacy attempts như tổng lượt học. |
| F08 | Đã có quality harness offline versioned, tách khỏi live provider và không ghi đè `eval/report.md` của người dùng. |

Bằng chứng local cuối: `npm test` **387/387 qua 78 test files**; type-check, Prisma validate/generate và production build pass; lint exit 0 với 34 warnings có trước; full E2E **20/20** trên SQLite mới, cô lập; offline quality evaluation **30/30 cases** và **12/12 dataset checks** pass. Đợt audit độc lập không còn P0/P1 có thể tái hiện trong P81/P83.

Phần vẫn mở: deploy/cutover/rollback Vercel–Turso, xác nhận Preview/Production, successful live AI provider và pilot có đồng thuận. Một P2 được ghi nhận nhưng không chặn local integrity: nếu lesson bị unpublish sau khi provider đã trả kết quả Coach, reservation có thể đã bị tiêu tốn trước khi atomic published fence trả `TARGET_UNAVAILABLE`.
