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

## Causal Next Action Planner (`p11-v1`)

Kể từ Plan 11/12, `planNextLearningAction(userId, now)` trả về DTO phiên bản `p11-v1` (tương thích ngược với `p08-v1`) kèm căn cứ nhân quả `basis`:

```ts
export type CausalBasis =
  | { kind: "EVIDENCE"; skillKey: string; refs: EvidenceRef[] }
  | { kind: "DUE_REVIEW"; vocabularyItemId: string; dueAt: string }
  | { kind: "DECLARED_GOAL"; intentRevision: number }
  | { kind: "ACTIVE_SESSION"; sessionId: string }
  | { kind: "INSUFFICIENT_EVIDENCE" };
```

- **Bất biến nhân quả:** AI chỉ tuyên bố "AI có bằng chứng rằng bạn cần củng cố X" khi có bản ghi quan sát thực tế thuộc đúng `skillKey === X`. Nếu không có quan sát phù hợp, hệ thống chuyển sang Daily Quest theo mục tiêu khai báo (`DECLARED_GOAL`) hoặc nhiệm vụ khởi động (`INSUFFICIENT_EVIDENCE`).
- **Idempotency & Replay:** Đọc kế hoạch hoàn toàn read-only (0 ghi DB, 0 gọi provider). Trạng thái phiên lưu vết và đề xuất kế tiếp duy trì nhất quán qua reload trang.

## Bộ kiểm định sư phạm & Đánh giá chất lượng (`eval:learning`)

- CLI: `npm run eval:learning -- --mode offline|live --dataset eval/learning-cases.v1.jsonl --out-dir eval/runs/<date>-<sha>`
- Bộ dữ liệu tổng hợp 12 ca nhiều lượt (≥4 Mission, ≥4 Lesson Coach, ≥4 Daily Quest) bao phủ: phản xạ ngôn ngữ thay thế, sửa lỗi sai dai dẳng, đầu vào mơ hồ/lạc đề, phòng thủ prompt injection, bám sát giáo trình, chuyển đổi mục tiêu giữa phiên, và khả năng chịu lỗi provider.
- Ma trận 5 tiêu chí chấm điểm chất lượng (0, 1, 2): Đúng đắn ngôn ngữ (Correctness), Mức độ phù hợp (Level Fit), Gợi ý Socratic (Actionable Hint), Bám sát ngữ cảnh (Contextual Relevance), và Khuyến khích sửa sai (Learner Retry).

## Thử nghiệm có kiểm soát (Pilot Study Protocol)

- Tham khảo [docs/PILOT_PROGRAM_SPEC.md](PILOT_PROGRAM_SPEC.md).
- Cohort 5–8 người lớn có sự đồng thuận (consent), theo dõi 14 ngày (Baseline → Formative Loop → Transfer Task → Delayed Retention).
- Phân tích và kiểm tra tính toàn vẹn dữ liệu bằng công cụ `npm run pilot:analyze`.

## Quality gates (1.0.0 Release)

Trước khi nghiệm thu bất kỳ thay đổi nào:

1. `npm run type-check` (0 lỗi)
2. `npm test` (100% test files pass)
3. `npm run lint` (0 lỗi, cảnh báo <= 32)
4. `npm run eval:learning` (12/12 ca pass kiểm định cấu trúc)
5. `npm run test:e2e` (toàn bộ suite Playwright pass)
6. `npx tsx scripts/verify-backup-restore.ts` (100% data fidelity)

