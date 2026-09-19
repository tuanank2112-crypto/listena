# 01 — Contracts

## 1. Schema (migration `20260920080000_plan23_learner_mission_scenarios`)

```prisma
model LearnerMissionScenario {
  id                   String    @id @default(uuid())
  userId               String
  sourcePrompt         String    // câu tóm tắt tiếng Việt, học viên đọc lại
  title                String
  npcName              String
  npcRole              String
  learnerGoal          String
  openingLine          String
  firstPrompt          String
  targetVocabularyJson String    @default("[]")
  targetGrammarJson    String    @default("[]")
  maxTurns             Int       @default(7)
  archivedAt           DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([userId, archivedAt, createdAt])
}
```

**BẮT BUỘC** `archivedAt` nullable và dùng **lưu trữ mềm**: một phiên đã chơi vẫn nêu tên chủ đề, tên ấy phải còn giải được.

## 2. Khoá chủ đề (`src/server/ai/mission-templates.ts`)

```ts
export const CUSTOM_SCENARIO_PREFIX = "custom-";
export function customScenarioKey(id: string): string;
export function customScenarioId(key: string): string | null;   // null nếu không đúng dạng
export function isMissionScenarioKey(v?: string): v is MissionScenarioKey;  // chỉ built-in
export function isKnownScenarioKey(v?: string): v is string;    // built-in HOẶC đúng dạng custom
export function getMissionTemplate(key?: string, customTemplate?: MissionTemplate | null): MissionTemplate;
```

**BẮT BUỘC** `MissionTemplate.key` là `string`, không còn union. Union là thứ khiến chủ đề phải là mã.

**BẮT BUỘC** `isKnownScenarioKey` **đồng bộ và không đọc DB**. Nó tồn tại để planner, repository và session service giữ được rào kiểm mà không file nào phải thành async.

**CẤM** hiểu `isKnownScenarioKey` là kiểm quyền. Xem bất biến BB3.

## 3. Sinh chủ đề (`src/server/ai/scenario-author.ts`)

```ts
export const GeneratedScenarioSchema: z.ZodType<{
  title; npcName; npcRole; learnerGoal; openingLine; firstPrompt;
  targetVocabulary: string[];   // 3..8
  targetGrammar: string[];      // 1..4
  summaryVi: string;            // MỘT câu tiếng Việt
}>;
export const GENERATED_SCENARIO_JSON_SCHEMA: JsonSchema;   // additionalProperties: false
export const SCENARIO_AUTHOR_SYSTEM_PROMPT: string;
export function buildScenarioAuthorInput(input: ScenarioAuthorInput): Record<string, unknown>;
export function toMissionTemplate(key, scenario, maxTurns): MissionTemplate;
```

**BẮT BUỘC** mọi hàm ở đây thuần: không DB, không `Date.now()`, không gọi provider. Nhờ vậy prompt và ràng buộc kiểm được bằng test.

**BẮT BUỘC** `maxTurns` do caller truyền, **CẤM** lấy từ đầu ra của model.

**BẮT BUỘC** `buildScenarioAuthorInput` cắt mọi danh sách (5 sở thích, 3 lỗi hay lặp, 8 từ hay sai) và cắt câu của học viên còn 240 ký tự.

## 4. Dịch vụ (`src/server/learning/mission-scenarios.ts`)

```ts
export const MAX_LEARNER_SCENARIOS = 12;
export async function listLearnerMissionScenarios(userId): Promise<LearnerScenarioView[]>;
export async function loadCustomMissionTemplate(userId, key?): Promise<MissionTemplate | null>;
export async function createLearnerMissionScenario({ userId, prompt }): Promise<LearnerScenarioView>;
export async function archiveLearnerMissionScenario(userId, id): Promise<boolean>;
export class ScenarioLimitError extends Error { code = "SCENARIO_LIMIT" }
```

**BẮT BUỘC** `loadCustomMissionTemplate` **không** lọc `archivedAt`: phiên đang chơi một chủ đề vừa bị xoá vẫn phải chơi hết được.

**BẮT BUỘC** `archiveLearnerMissionScenario` dùng `updateMany` với `where: { id, userId }`. Đó **chính là** phép kiểm quyền: chủ đề của người khác khớp 0 dòng và trả về y như một chủ đề không tồn tại.

## 5. Endpoint

| Route | Làm gì | Mã lỗi |
|---|---|---|
| `GET /api/learner/mission-scenarios` | Liệt kê chủ đề của caller | `401` |
| `POST /api/learner/mission-scenarios` | `{ prompt: string }` 6..240 ký tự, `.strict()` | `400` sai dạng · `401` · `409 SCENARIO_LIMIT` · `503 AI_UNAVAILABLE` |
| `DELETE /api/learner/mission-scenarios/{id}` | Lưu trữ mềm | `401` · `404` (gồm cả chủ đề của người khác) |

`POST` đặt `maxDuration = 120` vì Vyce là gateway và lượt gọi nguội có thể chậm.

**CẤM** route nào nhận `userId` từ client.

**BẮT BUỘC** khi provider lỗi, thông điệp nói là hệ thống chưa tạo được — **CẤM** đổ cho câu học viên viết.

## 6. Giao diện

| Thứ | Bất biến |
|---|---|
| Khu chủ đề | `section[aria-labelledby="my-scenarios-heading"]`, mỗi thẻ có `data-scenario="<key>"` |
| Nút giải nghĩa | Nhãn `Giải nghĩa` / `Ẩn giải nghĩa`, mang `aria-expanded`; mặc định **đóng** |
| Lời Coach | **CẤM** hiển thị khi chưa bấm, **CẤM** tự đọc |
| Nghe lời giải nghĩa | Một nút loa **bên trong** phần đã mở, bấm mới đọc |
