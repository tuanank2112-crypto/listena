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

## 4. Khoá `custom-<uuid>`

`isMissionScenarioKey` là rào kiểm ở **6 file**. Biến nó thành truy vấn DB thì planner, repository và session service đều phải thành async — sửa lớn, rủi ro cao, cho một tính năng nhỏ.

Nên chủ đề riêng mang khoá `custom-<uuid>`: nhận ra được bằng **hình dạng**, đồng bộ, không cần DB. Quyền sở hữu kiểm **đúng một chỗ**, `loadCustomMissionTemplate(userId, key)`.

**VÙNG CẤM:** đừng nhầm hai thứ đó. Khoá đúng dạng **không** nghĩa là được phép dùng. Khoá của người khác nạp ra `null` và session service trả `404` y như khoá bịa — đã ghim bằng E2E.

## 5. Ngân sách và giới hạn

Mỗi lượt sinh đi qua `reserveUserAICall` / `settleUserAICall` như mọi tính năng AI khác, nên không ai đúc chủ đề vô hạn. Mỗi học viên giữ tối đa `MAX_LEARNER_SCENARIOS = 12` chủ đề còn hiệu lực; vượt thì `409 SCENARIO_LIMIT` kèm câu tiếng Việt nói rõ phải xoá bớt.

## 6. Ranh giới orchestrator

`tutor-orchestrator.ts` **không** import Prisma, và chính ranh giới đó cho phép nó được test với provider giả mà không cần database. Nên template được **caller truyền vào** (`customTemplate`), đúng cách `lessonContext` đang làm.

Hệ quả phải xử: `planDailyQuest` chỉ nhận khoá built-in. Đường Daily Quest và đường chủ đề riêng vì thế được **tách rõ** thay vì dùng chung một biến `plannedScenarioKey` như trước.
