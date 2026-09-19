# OPERATIONS — Triển khai, vận hành, rollback

## 1. Thứ tự bắt buộc

1. `npm run type-check`
2. `npx eslint .`
3. `npx vitest run`
4. `npm run build`
5. `npx playwright test`
6. Commit, rồi push `origin/codex/vercel-turso-migration`
7. Deploy production: `npx vercel --prod --yes --scope n-listen-ai`

**BẮT BUỘC** `--scope n-listen-ai`. Thiếu scope thì CLI báo `Not authorized` (bài học Plan18).

## 2. Không có bước hạ tầng

- **Không migration.** Plan20 không đổi schema; không chạy `prisma migrate` ở bất kỳ môi trường nào.
- **Không biến môi trường mới.**
- **Không dependency mới.**
- **Không đụng `prisma/dev.db`** hay bất kỳ DB người dùng/hosted nào.

## 3. WAL cho database E2E

`e2e/setup.ts` đặt `PRAGMA journal_mode=WAL` **chỉ** trên database tạm trong `tmpdir`, sau khi hàm setup đã tự chối chạy ngoài thư mục cách ly. Nếu pragma không trả về `wal`, setup **ném lỗi** thay vì chạy tiếp — một lượt E2E ở chế độ journal cũ sẽ lại flake và làm mất lòng tin vào kết quả.

**CẤM** áp WAL cho `prisma/dev.db` hay Turso.

## 4. Rollback

Toàn bộ Plan20 là mã ứng dụng: `git revert` commit là xong, không có trạng thái nào phải hoàn nguyên.

Rollback từng phần:

| Muốn bỏ | Cách |
|---|---|
| Trang "Từ yếu" | Bỏ mục nav và thư mục `src/app/learner/vocabulary/`. Route API còn lại vẫn vô hại vì chỉ đọc. |
| Ba tốc độ nghe | Bỏ `SPELL_SPEEDS` và prop `rate`; `HiddenAudioButton` mặc định `rate = 1` nên hành vi trở lại đúng như trước. |
| WAL ở E2E | Bỏ khối pragma trong `e2e/setup.ts`. Flake `timeline.spec.ts` sẽ quay lại — chỉ làm nếu có bằng chứng WAL gây hại. |

## 5. Giám sát sau deploy

Route mới chỉ đọc, không có tác dụng phụ. Kiểm tra sau deploy: `/learner/vocabulary` trả `307` về `/login?callbackUrl=%2Flearner%2Fvocabulary` khi chưa đăng nhập (chứng tỏ route đã lên và vẫn được guard), và `/api/learner/vocabulary-review` trả `401` khi gọi ẩn danh.
