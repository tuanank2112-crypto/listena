# ListenAI AI-first Architecture

> Cập nhật: 2026-09-02

## Mục tiêu

Đơn vị học trung tâm là một phiên nhiều lượt, không còn chỉ là `prompt -> answer -> score`.

```text
Learner input
  -> session service
  -> grounded tutor orchestrator
  -> structured TutorTurnOutput
  -> deterministic validation/scoring
  -> persist turn/evidence/intervention
  -> update mastery
  -> choose the next turn
```

## Thành phần chính

- `LearningSession`: mode, goal, mission state, status và lesson snapshot.
- `LearningTurn`: lượt của learner, AI hoặc system; có `clientTurnId` để retry idempotent.
- `LearningEvidence`: skill, score, confidence, hint/replay và response time.
- `Intervention`: public spec cho UI và `validatorJson` server-only.
- `AIInteraction`: provider/model/prompt version/fallback/schema validity và trace metadata.

Contract chung nằm ở `src/server/validation/learning-session.ts`. Không thay đổi contract này từ nhiều nhánh song song; root/orchestrator phải khóa thay đổi trước khi giao agent.

## API

- `POST /api/learning-sessions`: tạo Lesson Coach, Mission hoặc Daily Quest.
- `GET /api/learning-sessions/[sessionId]`: resume session theo ownership.
- `POST /api/learning-sessions/[sessionId]/turns`: append learner turn, gọi tutor và lưu AI turn/evidence.
- `POST /api/learning-sessions/[sessionId]/events`: hint, replay, pause, resume hoặc abandon.
- `POST /api/learning-sessions/[sessionId]/complete`: debrief và cập nhật thời gian học.

Tất cả route phải auth, kiểm tra ownership, validate Zod và trả DTO tối thiểu. `validatorJson`, đáp án đúng và prompt nội bộ không được gửi xuống client.

## AI runtime

`src/server/ai/tutor-orchestrator.ts` là entry point duy nhất cho session runtime:

- `startMission()` tạo state/opening.
- `evaluateTutorTurn()` retrieve context, gọi provider và validate structured output.
- `LESSON_COACH` tạo template động từ lesson, không dùng scenario nhập vai mặc định.
- `MISSION` dùng các template authored: lost luggage, cafe order và mystery clue.
- `DAILY_QUEST` chọn skill yếu và vocabulary đến hạn.
- Khi provider lỗi hoặc output sai schema, deterministic fallback tiếp tục session.

AI chỉ tạo dialogue, coaching act và intervention spec. State transition, scoring, SRS, mastery và validator do code server quyết định.

## UI

Session player dùng reducer với các trạng thái load/submit/retry/complete, hỗ trợ TTS và năm intervention. Game Hub đưa AI Mission lên trước; quiz/match/spell chỉ là Quick comeback và phải gửi result về `/api/game-session`.

## Quality gates

Trước khi merge thay đổi session runtime:

1. `npm run type-check`
2. `npm test`
3. `npm run lint`
4. `npm run test:e2e`
5. `npm run build`
6. `npx prisma validate && npx prisma migrate status`

E2E bắt buộc bao gồm login learner, mở mission, gửi một turn, nhận AI response và reload/resume.

## Rủi ro còn lại

- Schema hiện dùng SQLite local, trong khi Render blueprint cấp PostgreSQL; cần thống nhất provider trước production deployment.
- AI response hiện là request/response JSON, chưa stream token.
- Voice input/STT và pronunciation scoring chưa nằm trong MVP.
- Session concurrency có thể gọi provider thừa khi hai retry đến đồng thời, nhưng unique key ngăn lưu turn trùng.
