# Ke hoach #02 - AI-native Upgrade (0.2.0 MINOR)
- STT: 02
- Trang thai: DRAFT -> IN PROGRESS (sau duyet)
- Bat dau: 2026-09-07
- Hoan tat: chua nghiem thu
- Phien ban muc tieu: 0.2.0 (MINOR)
- Pham vi: local + E2E isolated DB; production la plan 03 rieng
- Phu thuoc: Plan 01 (0.1.1) da PASS local gates

## Nhat ky quyet dinh
- 2026-09-07 16:00 - User chi dao AI-native: Mission/Coach/Quest -> reply -> feedback -> comeback -> evidence -> next action la luong chinh.
- 2026-09-07 17:00 - User yeu cau lam ro plan; neu chua ro thi tao plan upgrade. Quyet dinh: tao Plan 02 MINOR, khong gop DB migration.
- 2026-09-07 17:00 - Pham vi 02: learner memory xuyen phien + next-best-action + debrief->next + pedagogical eval + learner timeline. CAM: doi SQLite->Postgres, STT/pronunciation, streaming.
- 2026-09-07 18:05 - Root xu ly demo empty: dashboard/games/lessons dung course title cu TATQHP1... trong khi seed la English 1 - Listening and Vocabulary. Da dong bo bo loc va bo rang buoc title Bài  de demo 3 lessons hien du.
- Quyet dinh bi thay the: Khong co

## Muc tieu / Non-goals
Muc tieu: (1) memory co evidence doc/ghi moi turn, (2) debrief tra 1 next action grounded, (3) timeline hop nhat + weekly window dung.
Non-goals: khong doi DB provider, khong STT, khong streaming.

## Phan cong
| Goi | SPEC | Owner | Tier |
| P10 | SPEC-P10 Learner Memory | backend | Astra |
| P11 | SPEC-P11 Next Action | backend | Astra |
| P12 | SPEC-P12 Timeline | backend | Sol |
| P13 | SPEC-P13 Eval | eval | Luna |
| P14 | SPEC-P14 Verification | root | orchestrator |

## Checklist
- [x] P10: Schema LearnerMemory + repo + orchestrator
- [x] P11: Debrief nextAction grounded + API + nav
- [x] P12: Timeline unified + weekly window fix
- [x] P13: Eval harness 5 ca + bao cao
- [x] P14: Gates + dong bo brain/docs

## Router spec
- [Kien truc](specs/00-ARCHITECTURE.md)
- [Contracts](specs/01-CONTRACTS.md)
- [SPEC-P10](specs/SPEC-P10-learner-memory.md)
- [SPEC-P11](specs/SPEC-P11-next-action.md)
- [SPEC-P12](specs/SPEC-P12-timeline.md)
- [SPEC-P13](specs/SPEC-P13-eval.md)
- [Van hanh](specs/OPERATIONS.md)
- [Nghiem thu](specs/TESTING-ACCEPTANCE.md)

## Exit Gates
- local: type-check / tests / lint / Prisma / build / E2E phai PASS moi dong plan
- 2026-09-07 20:55 - Eval truoc do la self-assert (khong goi orchestrator). Quyet dinh: bien P13 thanh harness thuc goi startMission/evaluateTutorTurn voi DeterministicMockTutorProvider, kiem phase va grounded ids. Ket qua 15/15 PASS, grounded 4/15 dung ky vong; day la bang chung cuc noi bo, khong suy ro hieu qua hoc that.
