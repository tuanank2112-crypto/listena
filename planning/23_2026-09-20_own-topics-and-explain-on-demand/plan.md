# Kế hoạch 23 — Chủ đề của học viên, và giải nghĩa khi được hỏi

## Metadata Header

| Trường | Giá trị |
|---|---|
| Mã kế hoạch | 23_2026-09-20_own-topics-and-explain-on-demand |
| Loại | MINOR (SemVer) — đủ bộ SPEC theo luật §2 |
| Phiên bản dự án | 0.7.0 (bump là quyết định của user) |
| Ngày mở | 2026-09-20 |
| Trạng thái | SHIPPED — migration đã áp + deploy 2026-09-20 09:50; đường AI thật **đã chạy** (local, Vyce thật) và phơi ra một lỗi đã sửa; **bản sửa chưa deploy**; nghiệm thu tay trên production còn chờ mật khẩu |
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

### 2026-09-20 10:20–11:40 — Chạy thật đường AI, và lỗi mà chỉ chạy thật mới thấy

Mục "CHƯA NGHIỆM THU" ở trên nói đường sinh chủ đề bằng AI thật chưa ai chạy, vì E2E gieo sẵn chủ đề để khỏi tốn lượt AI. Không đăng nhập được production (mật khẩu đã đổi) nên **chạy tại chỗ với Vyce thật** trên một database SQLite dựng tạm từ migration trong thư mục temp của hệ điều hành — `prisma/dev.db` không bị mở.

**Lượt chạy thật ĐẦU TIÊN đã đỏ.** Không phải vì hạ tầng, mà vì một lỗi thiết kế của chính kế hoạch này:

```
ZodError: targetGrammar — Array must contain at most 4 element(s)
```

Model trả **năm** điểm ngữ pháp trong khi schema cho phép bốn, `parse` ném cả bản sinh đi, và route trả `503` kèm câu *"Chưa tạo được chủ đề lúc này. Bạn thử lại sau ít phút nhé."* Học viên viết một câu hoàn toàn bình thường và bị từ chối vì một giới hạn **của chúng ta**, kèm một thông báo họ không thể làm gì với nó.

**Lượt chạy thứ hai đỏ ở chỗ khác:** một nhãn ngữ pháp dài hơn 32 ký tự — `MAX_TERM`, con số đặt cho một *từ vựng*. "present continuous for future arrangements" là cách gọi tên bình thường của một điểm ngữ pháp.

**Đo trước khi sửa, thay vì đoán.** Gọi provider thật 15 lần với sáu câu yêu cầu khác nhau và ghi lại kích thước thật:

| Quan sát | Số đo |
|---|---|
| Độ dài nhãn ngữ pháp thường gặp | 14–21 ký tự (`"how long does it take"`) |
| Độ dài từ vựng thường gặp | ≤ 10 ký tự |
| Bị từ chối **chỉ vì** vượt cap danh sách | **2 / 15** |
| Hỏng ở tầng provider (524 / JSON hỏng) | 2 / 15 |

Nên `MAX_TERM = 32` là đủ cho từ vựng và **quá chật cho ngữ pháp**: một cap đặt không có số đo.

**Sửa — cap là của máy chủ, nên máy chủ tự làm cho vừa:** thêm `clampGeneratedScenarioLists()` chạy **trước** zod, và `MAX_GRAMMAR_TERM = 60` riêng cho nhãn ngữ pháp.

- **VÙNG CẤM — bỏ hẳn, không cắt cụt.** Mục quá dài bị **loại cả mục**, không bị xén. Một nhãn ngữ pháp cắt giữa chừng sẽ đi vào prompt của tutor thành vô nghĩa; còn bốn chuỗi học viên **đọc** (`title`, `openingLine`, `firstPrompt`, `summaryVi`) thì hàm này **không đụng tới** và vẫn bị zod từ chối nếu quá dài — thà bảo họ thử lại còn hơn đưa họ một câu cụt.
- **VÙNG CẤM — không khử trùng lặp.** Hai từ na ná nhau thì vô hại, còn khử trùng lặp có thể đẩy danh sách xuống dưới sàn ba mục và biến một bản sinh dùng được thành một lần từ chối — đúng thứ vừa bỏ công xoá đi.
- **VÙNG CẤM — không đem hàm này dùng cho `GeneratedInterventionSchema`.** Ở đó mục thừa có thể chính là **đáp án đúng** trong các lựa chọn của một câu quiz; bỏ nó đi là chấm học viên theo một đáp án chưa từng hiện ra. Chỉ được bỏ phần thừa ở nơi **không mục nào là chỗ dựa**.
- Zod vẫn là cổng thật: thiếu trường, chuỗi rỗng, hay **quá ít** mục thì vẫn trượt.

**Nghiệm thu đường đầy đủ bằng AI thật (01:14):**

```
authoring #1     ok in 5.3s
title            Checking in During an Online Game
npc              Alex — Online gaming teammate
summaryVi        Bạn đang chơi game online với đồng đội và cần báo tình trạng nhân vật cho họ.
targetVocabulary ["check in","status","mana","health","backup","need"]
openingLine      Hey, just checking in — how's your mana and health looking? Do you need me to back you up?
session start #1 ok in 4.3s
graded turn #1   FAILED after 125.1s code=AI_UNAVAILABLE reason=upstream_failure
graded turn #2   ok in 22.7s
detectedError    {"type":"tense","actual":"play/lose","explanationVi":"Với từ 'hôm qua', cần dùng thì quá khứ đơn…"}
score            0.6
voiceScript      ["NPC/en","NPC/en","NPC/en"]
```

Ba điều chỉ lượt chạy thật mới chứng minh được:

1. **Ngữ cảnh học viên thật sự đi vào tình huống.** `check in` là một trong ba từ hay sai đã gieo, và nó có mặt cả trong `targetVocabulary` lẫn **câu mở đầu** của nhân vật. Trước Plan23 `preferredTopics` bị bỏ qua hoàn toàn.
2. **Đường chủ đề riêng chạy suốt qua session service**: khoá `custom-<uuid>` → nạp có kiểm quyền → vào vai → chấm điểm máy chủ bắt đúng lỗi `tense` đã cài, kèm giải thích tiếng Việt.
3. **`voiceScript` chỉ có `NPC/en`** — SPEC-P231 được chứng minh trên đầu ra của model thật, không phải của stub. Trước đây chỉ có test với provider tất định nói điều này.

**Gateway 524 đã gặp 3 lần, latency ~125s, cùng input gửi lại thì thành công** — đúng đặc tính user đã chấp nhận ngày 2026-09-20 07:00 ("Vyce là gateway api nên nó chậm 1 chút"). Không phải lỗi của đường này, và app vốn đã ánh xạ nó thành `AI_UNAVAILABLE` cho phép thử lại.

**Giữ lại `src/server/learning/live-scenario-authoring.test.ts` — OPT-IN, không nằm trong gate.** Phải có **cả** provider cấu hình đúng **và** `LISTENAI_LIVE_AI_PROBE=1` mới chạy; không có thì `skipped`. Lý do không cho vào suite mặc định: nó tốn lượt AI thật và thừa hưởng độ phập phù của gateway, mà một test phập phù trong cổng kiểm sẽ dạy mọi người quen với màu đỏ. Đây chính là mục số 3 trong danh sách ưu tiên sau sự cố AI ở `roadmap.md`: *"thêm một smoke thật chạm provider vào quy trình; toàn bộ test hiện dùng provider tất định nên không bao giờ bắt được loại lỗi này."* Lượt chạy đầu tiên của nó bắt được lỗi thật, ngay lập tức.

**Bẫy công cụ đã vấp, ghi để khỏi mất thời gian lần sau:** vitest **nuốt** `console.log` của một test **đã xanh**, nên probe chạy xong mà không thấy model viết gì. Phải chạy kèm `--disableConsoleIntercept` (đã ghi trong đầu file).

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
| WP12 | **Áp migration lên production**, rồi deploy | ✅ |
| WP13 | **Chạy đường sinh chủ đề bằng AI thật** → tìm ra lỗi cắt danh sách, sửa, và giữ lại một live probe opt-in | ✅ |

## Exit Gates

| Gate | Kết quả | Môi trường |
|---|---|---|
| `npm run type-check` | 0 lỗi | ✅ local / ⬜ server |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | ✅ local / ⬜ server |
| `npx vitest run` | **949 test** (948 + 1 live skipped; trước 939) | ✅ local / ⬜ server |
| `npm run build` | PASS, có 2 route scenario | ✅ local / ⬜ server |
| `npx playwright test` | **53/53** (trước 50/50) | ✅ local / ⬜ server |
| Đường sinh chủ đề bằng **AI thật** | chạy được, sau khi sửa lỗi cap danh sách | ✅ local (Vyce thật) / ⬜ server |
| Migration áp lên production | **33 bảng/65 index → 34/66**, integrity ok, 0 vi phạm FK | ✅ **server** |

### 2026-09-20 09:50 — Migration production và deploy

```
before: tables=33 indexes=65 integrity=ok foreign_key_violations=0
to apply: table LearnerMissionScenario, index LearnerMissionScenario_userId_archivedAt_createdAt_idx
applied 2 statements
after:  tables=34 indexes=66 integrity=ok foreign_key_violations=0
```

`before` khớp đúng trạng thái sau Plan22, xác nhận đúng database. Deploy **sau** migration: `https://listena-mpb3rwmfn-n-listen-ai.vercel.app` READY.

Nghiệm thu ẩn danh: cả ba route scenario trả `401`; `/` trả `200`; `/learner/games` trả `307` về login.

### 2026-09-20 10:00 — Không nghiệm thu được đường AI thật: mật khẩu tài khoản kiểm thử đã đổi

Thử tạo chủ đề bằng AI thật thì đăng nhập bị từ chối. Mã lỗi là **`credentials`**, không phải `auth_locked`, nên **không phải** khoá do chống dò — mật khẩu `Listena#Prod-2026-09b` không còn đúng. Kiểm lại bằng cả `fetch` lẫn trình duyệt thật: cùng kết quả.

Nhiều khả năng user đã tự đổi sau khi tôi nhắc hai lần rằng mật khẩu đó đã đi qua lịch sử chat — tức là họ làm đúng.

**Hệ quả:** đường **sinh chủ đề bằng AI thật** vẫn chưa được nghiệm thu, đúng như `TESTING-ACCEPTANCE.md` mục 3 đã cảnh báo rằng E2E không phủ nó. Mọi thứ khác đã xanh.

## Việc còn mở

- Chưa nghiệm thu sinh chủ đề bằng **AI thật** (E2E dùng bản gieo sẵn để không tốn lượt AI); phải thử trên production sau khi deploy.
- User nói "vài thiếu sót" nhưng mới nêu rõ hai; cái thứ ba chưa biết.
