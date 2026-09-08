# 01 - Contracts (Plan 02)

## LearnerMemory
```ts
type LearnerMemory = {
  userId: string;
  goals: { text: string; evidenceIds: string[]; updatedAt: Date }[];
  recurringErrors: { errorType: string; count: number; lastEvidenceId: string }[];
  provenSkills: { skillKey: string; masteryScore: number; evidenceCount: number }[];
  preferences: { topics: string[]; updatedAt: Date };
}
```
- Prisma: model LearnerMemory { id, userId @unique, goalsJson, errorsJson, skillsJson, preferencesJson, updatedAt }
- Repo: getLearnerMemory(userId): LearnerMemory | null; upsertLearnerMemory(userId, patch, evidenceId): LearnerMemory
- MUST: moi patch phai kem evidenceId; khong ghi de toan bo JSON neu khong co evidence.

## Next Action (Debrief)
```ts
type NextAction = {
  kind: "COACH" | "MISSION" | "QUEST" | "PRACTICE";
  targetId?: string; // lessonId | scenarioKey | vocabularyItemId
  reason: string; // grounded: "vi ban sai X 3 lan gan day" + evidence ref
  evidenceRefs: string[];
}
POST /api/learning-sessions/:id/complete -> { session, nextAction: NextAction | null }
```
MUST: reason phai trich evidence/thong ke thuc; khong duoc generic "hay hoc tiep". CAM tao lesson/scenario khong ton tai.

## Timeline & Metrics
```ts
GET /api/learner/timeline?window=7d -> { items: TimelineItem[], weeklyStudyTime: number }
TimelineItem = { kind: "SESSION"|"EVIDENCE"|"ATTEMPT"|"REVIEW", id, createdAt, score?, skillKey? }
```
weeklyStudyTime = sum(studyMinutes) cua session COMPLETED trong 7 ngay gan nhat (cua so truot), khong phai lifetime capped.

## Eval harness
`eval/cases.jsonl` moi dong: { id, kind: "correct"|"wrong"|"short"|"vague"|"off-topic", input, expectedPhase, expectGrounded }
Runner: `npm run eval` doc cases, goi tutor-orchestrator mock, kiem grounded va phase.

| Phan loai | Caller |
| invalid memory patch | 400, khong ghi |
| nextAction khong tim thay target | fallback PRACTICE, log warning |
| timeline empty | 200 { items: [], weeklyStudyTime: 0 } |
```
