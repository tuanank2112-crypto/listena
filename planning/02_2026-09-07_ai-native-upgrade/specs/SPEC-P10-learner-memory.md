# SPEC-P10 - Learner Memory xuyen phien

## Contract chinh xac
- Prisma: `model LearnerMemory { id String @id @default(cuid()); userId String @unique; goalsJson String @default("[]"); errorsJson String @default("[]"); skillsJson String @default("[]"); preferencesJson String @default("{}"); updatedAt DateTime @updatedAt; user User @relation(fields:[userId], references:[id]) }`
- Repo: `getLearnerMemory(userId)`, `upsertLearnerMemory(userId, patch: Partial<LearnerMemory>, evidenceId: string)`
- Orchestrator: truoc `evaluateTutorTurn`, doc memory va inject vao prompt context (toi da 800 tokens); sau persist evidence, goi upsert voi evidenceId.

## BAT BUOC / CAM
- BAT BUOC: moi ghi memory phai kem evidenceId hop le; goals/errors/skills deu co evidenceRefs.
- BAT BUOC: khong gui validator/memory raw xuong client; chi gui DTO tom tat.
- CAM: ghi de toan bo JSON khi chi cap nhat 1 truong; phai merge.
- CAM: dung memory de quyet dinh score thay validator.

## Vung cam
Khong dung vector DB trong 02; retrieval van keyword. Ly do: chua co infra + eval.

## Loi + hanh vi caller
| Loi | Hanh vi |
| thieu evidenceId | 400, khong ghi |
| memory corrupt JSON | fallback rỗng + log, khong 500 |
| concurrent write | last-write-wins theo updatedAt |

## Nghiem thu
- Unit: get/upsert merge dung, corrupt fallback.
- Integration: memory doc truoc turn va ghi sau turn, co evidence linkage.
