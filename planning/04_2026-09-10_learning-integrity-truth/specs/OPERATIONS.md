# Operations

## Required run order

1. Run the repository brain boot `init_brain.js <root> --check`.
2. Inspect `git status --short`; preserve unrelated `eval/report.md` timestamp change.
3. Run targeted Vitest tests for P41–P43, then `npm test`, `npm run type-check`, `npm run lint`, `npm run eval`, `npx prisma validate`, and `npm run build`.
4. Check that no repository Next dev server holds the lock. Run `npm run test:e2e` only against its existing isolated temporary database with `AI_PROVIDER=mock`.
5. Inspect new completion screenshots when generated and record exact results.

## MUST / MUST NOT

- MUST preserve existing working files; do not reset, clean, migrate, seed or modify `prisma/dev.db`.
- MUST NOT run build and E2E concurrently against `.next`.
- MUST NOT deploy, modify Render, rotate secrets, or claim PostgreSQL/live-provider verification.
- MUST NOT stop a process until confirming it belongs to this repository and conflicts with the planned check.

## Rollback

Revert only reviewed Plan04 hunks. No schema migration means rollback is source-only. If a partial-completion compatibility regression is found, restore the prior UI/DTO together; never patch database records to fake an outcome.

## Error matrix

| Failure | Required response |
|---|---|
| targeted regression fails | fix with the owning Terra agent, rerun target before broad gates |
| build/E2E lock conflict | identify repository-owned process; do not terminate unrelated work |
| E2E environmental failure | record exact evidence, run all non-browser gates, leave local E2E gate open |
| dirty unrelated file | leave untouched and exclude from Plan04 review |
