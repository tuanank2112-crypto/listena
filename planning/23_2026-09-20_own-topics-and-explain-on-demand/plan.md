# Kế hoạch 23 — Chủ đề của học viên, và giải nghĩa khi được hỏi

## Metadata Header

| Trường | Giá trị |
|---|---|
| Mã kế hoạch | 23_2026-09-20_own-topics-and-explain-on-demand |
| Loại | MINOR (SemVer) — đủ bộ SPEC theo luật §2 |
| Phiên bản dự án | 0.7.0 (bump là quyết định của user) |
| Ngày mở | 2026-09-20 |
| Trạng thái | LOCAL ACCEPTED — 5/5 gate xanh; **có migration, chưa áp lên production** |
| Nguồn yêu cầu | User sau khi xem production: "quá ít chủ đề… cần có chức năng tạo chủ đề chứ không nên mock-data", "reasoning của AI không nên nói ra và dịch thành tiếng Việt, chỉ cần có thêm nút giải nghĩa", và "tôi không muốn nó bị truyền thống hoá khi có sự kết hợp của AI" |

## Bảng trỏ SPEC

| File | Nội dung |
|---|---|
| [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) | Nguyên tắc nền, non-goals, bất biến |
| [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) | Schema, chữ ký, endpoint, bảng lỗi |
| [`specs/SPEC-P231-explain-on-demand.md`](specs/SPEC-P231-explain-on-demand.md) | Bỏ đọc reasoning, thêm nút giải nghĩa |
| [`specs/SPEC-P232-scenario-authoring.md`](specs/SPEC-P232-scenario-authoring.md) | AI viết chủ đề từ lời học viên |
| [`specs/SPEC-P233-scenario-routes.md`](specs/SPEC-P233-scenario-routes.md) | Endpoint và quyền sở hữu |
| [`specs/SPEC-P234-my-scenarios-ui.md`](specs/SPEC-P234-my-scenarios-ui.md) | Khu "Chủ đề của bạn" |
| [`specs/OPERATIONS.md`](specs/OPERATIONS.md) | Migration trước, deploy sau |
| [`specs/TESTING-ACCEPTANCE.md`](specs/TESTING-ACCEPTANCE.md) | Ma trận test và bằng chứng |

## Nhật ký quyết định

### 2026-09-20 07:40 — Hai yêu cầu, một nguyên tắc

User nêu hai thiếu sót rồi thêm một câu quyết định hướng: *"tôi không muốn nó bị truyền thống hoá khi có sự kết hợp của AI."*

Đọc lại hai yêu cầu dưới câu đó thì thấy chúng là **cùng một nguyên tắc**: sản phẩm đang **quyết thay** học viên. Nó quyết họ chỉ được tập ba tình huống, và quyết họ cần nghe lời giải thích bằng tiếng Việt sau mỗi lượt. Một ứng dụng học truyền thống làm đúng hai việc đó.

Nên cả hai phần của kế hoạch này đều là **trả quyền quyết định về cho học viên**.

### 2026-09-20 07:55 — Chủ đề: để AI viết, đừng làm form quản trị

Cách "đúng kiểu kỹ sư" là làm một màn CRUD chủ đề: nhập tiêu đề, nhân vật, câu mở đầu, từ khoá. **Đã loại.** Học viên A1-A2 không biết một tình huống luyện nói cần những trường gì, và bắt họ điền là đổi một danh sách cứng lấy một cái form — vẫn truyền thống, chỉ thêm việc.

Chọn: học viên viết **một câu tiếng Việt** về thứ họ muốn tập, AI dựng ra tình huống. Model chỉ được quyết **phần hư cấu** (nhân vật là ai, ở đâu, câu đầu tiên là gì). Mọi thứ điều khiển phiên học — số lượt, chấm điểm, bằng chứng — vẫn của máy chủ.

Và có một chi tiết đắt tìm được khi đọc mã: học viên **đã** khai `preferredTopics` ở dashboard (tài khoản thật ghi "chơi game") mà **không nơi nào dùng**. Ba chủ đề cứng bỏ qua hoàn toàn. Nay sở thích đó, cộng lỗi hay lặp và từ hay sai, trở thành ngữ cảnh để AI viết tình huống.

### 2026-09-20 08:10 — Khoá chủ đề: giữ rào kiểm đồng bộ, đừng lan async ra cả hệ

`isMissionScenarioKey` đang là rào kiểm ở **6 file**. Biến nó thành truy vấn DB thì planner, repository và session service đều phải thành async — một đợt sửa lớn, rủi ro cao, cho một tính năng nhỏ.

Chọn: chủ đề của học viên mang khoá **`custom-<uuid>`**. Nhờ vậy:

- `isKnownScenarioKey` vẫn **đồng bộ**: built-in theo tên, của học viên theo **hình dạng**.
- Quyền sở hữu kiểm **đúng một chỗ** — `loadCustomMissionTemplate(userId, key)` — nơi template thực sự được nạp.

**Vùng cấm:** rào kiểm hình dạng **không phải** kiểm quyền. Ai đọc sau đừng tưởng key hợp lệ là được phép dùng. Key của người khác nạp ra `null`, và session service trả `404` y như key bịa — đã ghim bằng E2E.

### 2026-09-20 08:25 — Orchestrator không được đụng database

Chỗ cần template là `tutor-orchestrator.ts`. Cách nhanh là cho nó tự query. **Đã loại:** module đó hiện **không** import Prisma, và chính ranh giới ấy cho phép nó được test với một provider giả mà không cần database nào.

Chọn: caller (session service, vốn đã có `userId` và DB) nạp template rồi **truyền vào** như `lessonContext` đang làm. Ranh giới giữ nguyên.

Một hệ quả phải xử: `planDailyQuest` chỉ nhận khoá built-in. Nên đường Daily Quest và đường chủ đề riêng được **tách rõ** thay vì dùng chung một biến như trước.

### 2026-09-20 08:35 — Giải nghĩa: im lặng là mặc định

`voice-script.ts` đang đẩy `coachMessage` thành dòng `COACH` tiếng Việt, nên mỗi lượt AI **kết thúc bằng việc đọc lời giải thích**. Học viên hiểu rồi vẫn bị kéo về tiếng Việt.

Bỏ dòng đó. Lời giải thích lui về sau nút **"Giải nghĩa"**, và chỉ được đọc khi học viên bấm thêm nút loa trong đó.

Đây là **thu hẹp thêm** vùng cấm Plan14: trước chỉ cấm đọc câu sai của học viên; nay cả lời giải thích cũng không tự phát.

**Giữ lại có chủ đích:** dòng `RECAST` — câu đã sửa, đọc chậm, bằng tiếng Anh. Nó là mẫu để bắt chước, không phải lời giảng.

## Work Packages

| WP | Nội dung | Trạng thái |
|---|---|---|
| WP1 | Bỏ dòng COACH khỏi `voiceScript` + test | ✅ |
| WP2 | Nút "Giải nghĩa" trong session player | ✅ |
| WP3 | Schema + migration `LearnerMissionScenario` | ✅ |
| WP4 | Khoá `custom-<uuid>`, `isKnownScenarioKey`, `getMissionTemplate` nhận template ngoài | ✅ |
| WP5 | `scenario-author.ts` (prompt, schema, ánh xạ) + 15 test | ✅ |
| WP6 | `mission-scenarios.ts`: tạo có ngân sách AI, liệt kê, nạp có kiểm quyền, lưu trữ | ✅ |
| WP7 | Nối vào session service + tách đường Daily Quest | ✅ |
| WP8 | Endpoint GET/POST/DELETE | ✅ |
| WP9 | Khu "Chủ đề của bạn" | ✅ |
| WP10 | 3 ca E2E + cập nhật hồi quy đã đổi hành vi | ✅ |
| WP11 | Bộ SPEC + đồng bộ não | ✅ |
| WP12 | **Áp migration lên production**, rồi deploy | ⬜ |

## Exit Gates

| Gate | Kết quả | Môi trường |
|---|---|---|
| `npm run type-check` | 0 lỗi | ✅ local / ⬜ server |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | ✅ local / ⬜ server |
| `npx vitest run` | **939 test** (trước 921) | ✅ local / ⬜ server |
| `npm run build` | PASS, có 2 route scenario | ✅ local / ⬜ server |
| `npx playwright test` | **53/53** (trước 50/50) | ✅ local / ⬜ server |
| Migration áp lên production | chưa chạy | ⬜ server |

## Việc còn mở

- Áp migration `20260920080000_plan23_learner_mission_scenarios` **trước** khi deploy.
- Chưa nghiệm thu sinh chủ đề bằng **AI thật** (E2E dùng bản gieo sẵn để không tốn lượt AI); phải thử trên production sau khi deploy.
- User nói "vài thiếu sót" nhưng mới nêu rõ hai; cái thứ ba chưa biết.
