# OPERATIONS — Plan13

## Thứ tự bắt buộc
1. Worker A–E chạy song song trên working tree (không worktree riêng) với tập file rời nhau theo plan.md. Mỗi worker: đọc SPEC của mình + 00/01; đọc `node_modules/next/dist/docs` khi đụng API Next (`after`, route handlers, `proxy.ts`).
2. Worker KHÔNG chạy `prisma migrate dev`/`db push`; migration viết tay SQL + sửa `schema.prisma` + `prisma generate`. Kiểm bằng integration test trên SQLite tạm (mẫu: `src/server/services/learning-integrity.integration.test.ts`).
3. Worker chạy `npx vitest run <file của mình>` + `npm run type-check` cuối cùng (tsc toàn repo có thể đỏ tạm vì worker khác — ghi rõ lỗi thuộc file nào).
4. Root: sau khi tất cả báo cáo → `type-check`, `eslint .`, `vitest run`, `playwright test`, `next build` (dev server :3100 phải tắt trước build; bật lại sau), live smoke `live-smoke.sh` mở rộng (abandon, replaceActive, 202+poll, assist).
5. Không commit trong Plan13 cho tới khi root nghiệm thu; user quyết định commit/deploy.

## Live smoke (root) — mở rộng
- Bước 7b: `POST /api/learning-sessions/{id}/abandon` → 200 ABANDONED; sau đó LESSON_COACH → 201.
- Bước 8: personalized → 202 → poll `GET /{id}` tới READY (≤ 60s) → `POST /{id}/assist` SKELETON 200 → attempt.
- Bước 10: `POST /api/attempt/assist` TILES trên bài legacy → 200, tiles không theo thứ tự đáp án.
- Auth: 6 lần sai → 429/khoá; forgot-password 2 email (tồn tại/không) chênh < 100 ms.

## Rollback
- Mỗi WP là tập file rời → `git checkout -- <files>` theo WP. Migration Plan13 additive; rollback code không cần rollback DB (cột thừa vô hại).
- Production: chưa deploy Plan13 cho tới khi user đổi env `VYCE_*`; deploy = `npx vercel deploy --prod --yes` (user).
