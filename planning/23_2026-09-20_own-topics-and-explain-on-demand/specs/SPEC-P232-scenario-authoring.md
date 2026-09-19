# SPEC-P232 — AI viết chủ đề từ lời học viên

File: `src/server/ai/scenario-author.ts`, `src/server/learning/mission-scenarios.ts`, `src/server/ai/mission-templates.ts`.

## 1. Điều đang sai

`MissionScenarioKey` là **union type biên dịch** với đúng ba giá trị, `MISSION_TEMPLATES` là `Record` theo union đó, và `games-client.tsx` giữ **bản sao thứ hai** của cùng ba chủ đề cho giao diện. Thêm một chủ đề là sửa hai nơi rồi deploy.

Tệ hơn: học viên **đã** khai `preferredTopics` ở dashboard và **không nơi nào dùng**. Sản phẩm hỏi họ thích gì rồi bỏ qua câu trả lời.

## 2. Học viên viết một câu, AI dựng tình huống

Đầu vào cho model là câu của họ **cộng** ngữ cảnh máy chủ đã có:

| Trường | Nguồn | Cắt |
|---|---|---|
| `learnerRequest` | câu học viên gõ | 240 ký tự |
| `cefrLevel` | `LearnerProfile.estimatedCefrLevel` | — |
| `interests` | `LearnerProfile.preferredTopics` | 5 |
| `strugglesWith` | `aggregateRecurringErrors` (Plan21), nhãn tiếng Việt | 3 |
| `wordsToPractise` | từ có `incorrectCount > 0`, nhiều nhất trước | 8 |

**BẮT BUỘC** cắt mọi danh sách. Không có nó thì lịch sử của một học viên lâu năm trở thành cả cái prompt.

## 3. Model chỉ được quyết phần hư cấu

Đầu ra gồm `title`, `npcName`, `npcRole`, `learnerGoal`, `openingLine`, `firstPrompt`, `targetVocabulary`, `targetGrammar`, `summaryVi`.

**CẤM** trong đầu ra: số lượt, điểm, mức độ khó, bất cứ thứ gì điều khiển phiên học. `maxTurns` do máy chủ đặt (`SCENARIO_MAX_TURNS = 7`) — một tình huống tự đặt ngân sách lượt có thể tiêu hết buổi học mà học viên đã chọn thời lượng.

**BẮT BUỘC** `additionalProperties: false` trong JSON schema, và validate lại bằng zod sau khi provider trả về. Một trường lạ **CẤM** đi tiếp vào prompt của tutor.

**BẮT BUỘC** `summaryVi` là **một câu tiếng Việt** và **không** được đưa vào `MissionTemplate`. Tutor nói tiếng Anh; câu này tồn tại để học viên biết mình sắp bước vào tình huống gì. Đã ghim bằng test.

Luật trong system prompt đáng giữ:

- Nhân vật phải là người thật ngoài đời gặp (nhân viên phục vụ, hàng xóm, lễ tân). **Không** người dẫn chuyện, **không** giáo viên giảng ngữ pháp — nếu không ta chỉ dựng lại lớp học truyền thống trong một cái vỏ khác.
- `openingLine` và `firstPrompt` là **hai câu khác nhau**.
- `targetVocabulary` là từ học viên **sẽ phải nói**, không phải từ nói **về** chủ đề.
- Yêu cầu không an toàn ⇒ viết một tình huống đời thường vô hại và **không nhắc lại** yêu cầu đó.

## 3b. Cap là của máy chủ, nên máy chủ phải tự làm cho vừa (bổ sung 2026-09-20, sau lượt chạy AI thật)

Chữ ký:

```ts
export function clampGeneratedScenarioLists(output: unknown): unknown;
// gọi TRƯỚC zod:
GeneratedScenarioSchema.parse(clampGeneratedScenarioLists(response.output));
```

Số đo dẫn tới nó: gọi provider thật 15 lần, **2 lần bị từ chối CHỈ vì vượt cap danh sách** — một lần model trả năm điểm ngữ pháp thay vì bốn, một lần nhãn ngữ pháp dài hơn `MAX_TERM = 32` (con số đặt cho một *từ vựng*; nhãn ngữ pháp thật đo được 14–21 ký tự và có lúc vượt 32). Cả hai lần học viên nhận `503` *"Chưa tạo được chủ đề lúc này"* cho một yêu cầu hoàn toàn bình thường.

**BẮT BUỘC:**

- `MAX_GRAMMAR_TERM = 60` riêng cho nhãn ngữ pháp; `MAX_TERM = 32` giữ nguyên cho từ vựng.
- Hàm chạy **trước** zod và **chỉ** đụng `targetVocabulary` + `targetGrammar`: loại mục không phải chuỗi dùng được, loại mục quá dài, rồi lấy `n` mục đầu.
- Zod vẫn là cổng: thiếu trường, chuỗi rỗng, hoặc **quá ít** mục thì vẫn trượt.

**CẤM (vùng cấm):**

| Điều cấm | Lý do |
|---|---|
| Cắt cụt một chuỗi | Nhãn ngữ pháp cắt giữa chừng đi vào prompt tutor thành vô nghĩa. Bốn chuỗi học viên đọc (`title`, `openingLine`, `firstPrompt`, `summaryVi`) hàm này **không đụng tới** và vẫn bị zod từ chối nếu quá dài — thà bảo họ thử lại còn hơn đưa một câu cụt |
| Khử trùng lặp | Có thể đẩy danh sách xuống dưới sàn ba mục và biến bản sinh dùng được thành một lần từ chối |
| Nới cap trong zod thay vì clamp | Cap tồn tại để prompt của tutor không phình; bỏ cap là bỏ lý do có nó |
| Dùng lại hàm này cho `GeneratedInterventionSchema` | Ở đó mục thừa có thể là **đáp án đúng** của một câu quiz; bỏ nó đi là chấm học viên theo đáp án chưa từng hiện ra. Chỉ bỏ phần thừa ở nơi **không mục nào là chỗ dựa** |

Phân loại lỗi và hành vi bắt buộc của caller không đổi: bản sinh vẫn hỏng ⇒ `ZodError` ⇒ `createLearnerMissionScenario` ném ⇒ route trả `503` `AI_UNAVAILABLE`. Bản sửa này chỉ làm cho **trường hợp không đáng hỏng** thôi hỏng.

## 4. Khoá `custom-<uuid>`

`isMissionScenarioKey` là rào kiểm ở **6 file**. Biến nó thành truy vấn DB thì planner, repository và session service đều phải thành async — sửa lớn, rủi ro cao, cho một tính năng nhỏ.

Nên chủ đề riêng mang khoá `custom-<uuid>`: nhận ra được bằng **hình dạng**, đồng bộ, không cần DB. Quyền sở hữu kiểm **đúng một chỗ**, `loadCustomMissionTemplate(userId, key)`.

**VÙNG CẤM:** đừng nhầm hai thứ đó. Khoá đúng dạng **không** nghĩa là được phép dùng. Khoá của người khác nạp ra `null` và session service trả `404` y như khoá bịa — đã ghim bằng E2E.

## 5. Ngân sách và giới hạn

Mỗi lượt sinh đi qua `reserveUserAICall` / `settleUserAICall` như mọi tính năng AI khác, nên không ai đúc chủ đề vô hạn. Mỗi học viên giữ tối đa `MAX_LEARNER_SCENARIOS = 12` chủ đề còn hiệu lực; vượt thì `409 SCENARIO_LIMIT` kèm câu tiếng Việt nói rõ phải xoá bớt.

## 6. Ranh giới orchestrator

`tutor-orchestrator.ts` **không** import Prisma, và chính ranh giới đó cho phép nó được test với provider giả mà không cần database. Nên template được **caller truyền vào** (`customTemplate`), đúng cách `lessonContext` đang làm.

Hệ quả phải xử: `planDailyQuest` chỉ nhận khoá built-in. Đường Daily Quest và đường chủ đề riêng vì thế được **tách rõ** thay vì dùng chung một biến `plannedScenarioKey` như trước.
