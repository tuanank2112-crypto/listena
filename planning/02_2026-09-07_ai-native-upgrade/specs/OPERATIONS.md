# Operations - Plan 02

## Local
`npm run type-check`, `npm test`, `npm run lint`, `npx prisma validate && npx prisma migrate status`, `npm run build`, `npm run test:e2e`, `npm run eval`
E2E dung DB tam listena-e2e-*, AI_PROVIDER=mock, khong seed dev.db. Migration moi: `npx prisma migrate dev --name add-learner-memory` tren dev.db local, khong chay tren E2E fixture (fixture tu migrate deploy).

## Deploy/Rollback
Khong deploy trong 02. Rollback: revert migration `prisma/migrate down` hoac xoa model LearnerMemory + revert code; khong xoa du lieu hoc.

| Loi | Xu ly |
| Port E2E ban | doi port 3100->3101 |
| Build offline font | dung next/font/local hoac mock |
| Prisma lock | xoa tmp DB va migrate lai |

## Brain
Dung binding local brain4agent.old; init_brain.js --check truoc khi sua code.
