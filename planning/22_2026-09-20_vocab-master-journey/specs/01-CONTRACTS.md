# 01 — Contracts

## 1. Schema (migration `20260920030000_plan22_lesson_journey`)

```prisma
enum LessonJourneyStep { LEARN PRACTICE PLAY LISTEN TEST }

model LessonJourneyProgress {
  id          String            @id @default(uuid())
  userId      String
  lessonId    String
  step        LessonJourneyStep
  completedAt DateTime          @default(now())
  evidenceRef String?

  @@unique([userId, lessonId, step])
  @@index([userId, lessonId])
}

// AdaptiveGameRun gains:
lessonId String?   // null cho lượt chơi tự do
@@index([userId, lessonId, status])
```

**BẮT BUỘC:** khoá duy nhất `(userId, lessonId, step)` là thứ bảo đảm ghi hai lần không thành hai thành tích — **CẤM** thay bằng kiểm-rồi-ghi ở tầng ứng dụng, vì đó là một cuộc đua.

**BẮT BUỘC:** `lessonId` trên `AdaptiveGameRun` **nullable**. Mọi lượt chơi đã tồn tại đều hợp lệ với giá trị `NULL`, và một bản deploy cũ vẫn chạy được trên schema này.

## 2. Lõi thuần (`src/core/learning/lesson-journey.ts`)

```ts
export const LESSON_JOURNEY_STEPS = ["LEARN","PRACTICE","PLAY","LISTEN","TEST"] as const;
export type LessonJourneyStep = (typeof LESSON_JOURNEY_STEPS)[number];
export const LESSON_TEST_PASS_SCORE = 80;

export function describeJourneyStep(step: LessonJourneyStep): JourneyStepInfo;
export function isLessonJourneyStep(value: unknown): value is LessonJourneyStep;
export function summariseJourney(completedSteps: readonly string[]): JourneySummary;
export function deriveCompletedSteps(evidence: JourneyEvidence): LessonJourneyStep[];
```

**BẮT BUỘC:** `summariseJourney` bỏ qua tên bước nó không biết — một dòng do bản deploy mới ghi **CẤM** làm vỡ trang của bản cũ.

**BẮT BUỘC:** `nextStep` là bước **chưa xong đầu tiên theo thứ tự đường đi**, không phải bước sau bước vừa xong. Học viên nhảy cóc phải bị đưa **về** bước họ bỏ qua.

## 3. Lõi thuần (`src/core/games/run-progress.ts`)

```ts
export interface RoundOutcome { position: number; correct: boolean | null; score: number | null }
export interface RunProgress {
  answered: number; total: number; correct: number;
  streak: number; bestStreak: number; totalScore: number;
}
export function summariseRunProgress(rounds: readonly RoundOutcome[]): RunProgress;
export function comboLabelVi(streak: number): string | null;
```

**BẮT BUỘC:** đọc theo `position`, không theo thứ tự mảng — một câu trả lời tới muộn **CẤM** thổi phồng chuỗi combo.

**BẮT BUỘC:** lượt chưa trả lời bị **bỏ qua**, không tính là sai. Game đang chơi dở chưa làm đứt combo của ai.

**BẮT BUỘC:** `comboLabelVi` trả `null` khi `streak < 2`. Một câu đúng là một câu đúng, chưa phải combo.

## 4. Endpoint

### `GET /api/learner/lessons/{lessonId}/journey`

```ts
{
  lessonId: string;
  percent: number;                       // 0..100
  nextStep: LessonJourneyStep | null;
  isComplete: boolean;
  steps: Array<{ step; order; labelVi; hintVi; ctaVi; done }>;
}
```

### `POST /api/learner/lessons/{lessonId}/journey`

Không nhận thân yêu cầu. Ghi **đúng một** thứ: `LEARN` cho học viên đang đăng nhập. Trả về hành trình đã cập nhật, y hệt `GET`.

**CẤM** nhận tên bước từ client. Nếu client chọn được bước thì nó tự cấp cho mình 100% — mọi bước khác có bằng chứng thật đứng sau, bước này thì không, nên nó là bước duy nhất phải do máy chủ cố định.

### Bảng lỗi và hành vi bắt buộc của caller

| Tình huống | Mã | Caller phải làm |
|---|---|---|
| Không có phiên | `401` | Layout `learner/` đã đẩy về `/login`. **CẤM** hiện hành trình rỗng. |
| Bài không tồn tại hoặc chưa xuất bản | `404` | **CẤM** ghi gì. Cả `GET` lẫn `POST` đều kiểm trước. |
| Cấu hình / DB hỏng | mã của `databaseErrorResponse` | **Ẩn cả dải**. Trang bài học vẫn học được. |
| Lỗi khác | `500 {error:"Có lỗi xảy ra"}` | Như trên. |

### `POST /api/game-runs` — mở rộng

```ts
{ mode: "QUIZ" | "MATCH" | "SPELL", lessonId?: string }  // .strict()
```

`lessonId` phải là UUID. Có `lessonId` thì kho từ **chỉ** gồm từ của bài đó và **không** lấy từ riêng tư.

### `PublicGameAnswerResult` — mở rộng

```ts
progress: RunProgress   // máy chủ đếm; client chỉ hiển thị
```

## 5. Contract giao diện

| Thứ | Bất biến |
|---|---|
| Dải hành trình | `section[aria-labelledby="journey-heading"]`, mỗi bước là `li[data-step][data-done]` — E2E bám vào đây |
| Màn học từ | `section[aria-labelledby="word-cards-heading"]`; chỉ nút cuối cùng mới ghi bước LEARN |
| Chuỗi hiển thị | Chỉ `labelVi` / `hintVi` / `ctaVi`. **CẤM** in tên enum (`LEARN`, `PLAY`…) ra màn hình |
| Điểm trong game | Lấy từ `progress.totalScore`. **CẤM** client tự cộng điểm |
| Link bước PLAY/LISTEN | `/learner/games?lesson=<id>&mode=match|spell` |
