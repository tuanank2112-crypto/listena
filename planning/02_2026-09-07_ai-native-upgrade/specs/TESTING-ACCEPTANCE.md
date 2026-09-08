# Testing & Acceptance - Plan 02

## Gates
| Gate | Baseline | Target local |
| Vitest | 105/27 PASS | ✅ local PASS 106/106 (27 files) |
| Type-check | PASS | ✅ local PASS |
| ESLint | 0 err/38 warn | ✅ local 0 err/38 warning |
| Prisma validate/migrate | PASS/2 migrations | ✅ local PASS/3 migrations up to date |
| Build | FAIL offline font | ✅ local PASS |
| E2E | spawn EPERM | ✅ local PASS 7/7 (chromium, isolated DB) |
| Eval | chua co | ✅ local PASS 15/15 orchestrator mock, grounded 4/15 đúng kỳ vọng |

## Regression bat buoc
- Memory: doc truoc turn, ghi sau turn co evidenceId; corrupt fallback khong 500.
- NextAction: 4 nhanh uu tien + grounded reason + fallback PRACTICE.
- Timeline: weekly window 7d dung, khong lifetime capped; hop nhat 4 loai item.
- Eval: 5 kind cases deu pass.

## Evidence
Luumanh E2E trace + eval/report.md + TESTING-ACCEPTANCE bang PASS/FAIL theo moi truong local/server.
CAM dong plan khi con gate local FAIL.
- 2026-09-07 local evidence: demo learner@example.com / demo1234; DB seed co 2 users, 1 course, 3 lessons, 12 vocabulary, 1 recommendation. Dashboard, Lessons va Games da verify co du lieu.
