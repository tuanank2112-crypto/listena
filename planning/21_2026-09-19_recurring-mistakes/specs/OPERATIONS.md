# OPERATIONS — Triển khai, vận hành, rollback

## 1. Thứ tự bắt buộc

1. `npm run type-check`
2. `npx eslint .`
3. `npx vitest run`
4. `npm run build`
5. `npx playwright test`
6. Commit, push `origin/codex/vercel-turso-migration`
7. `npx vercel --prod --yes --scope n-listen-ai`

**BẮT BUỘC** `--scope n-listen-ai`; thiếu scope thì CLI báo `Not authorized`.

## 2. Không có bước hạ tầng

- **Không migration**, không cột mới, không đụng `prisma/dev.db` hay DB hosted.
- **Không biến môi trường mới**, không dependency mới.

## 3. Điều cần biết khi đọc dữ liệu sau khi deploy

`LearnerMemory.errorsJson` sẽ chứa **lẫn lộn** khoá chuẩn (ghi từ sau deploy) và kiểu thô của model (ghi từ trước). Đây là **trạng thái đã tính trước**, không phải hỏng dữ liệu: mọi đường đọc đều gộp lại nên hai dạng về cùng một họ.

`AggregatedError.rawTypes` liệt kê mọi cách viết đã gộp vào một họ — dùng nó khi cần biết model đang đặt tên lỗi thế nào trong thực tế.

## 4. Giám sát sau deploy

Route chỉ đọc, không có tác dụng phụ:

- `GET /learner/progress` khi chưa đăng nhập ⇒ `307` về `/login?callbackUrl=%2Flearner%2Fprogress`.
- `GET /api/learner/mistakes` ẩn danh ⇒ `401`.

## 5. Rollback

Toàn bộ là mã ứng dụng: `git revert` là xong, không trạng thái nào phải hoàn nguyên.

| Muốn bỏ | Cách | Hệ quả |
|---|---|---|
| Khu "Lỗi hay lặp" | Bỏ `<LearnerMistakes />` khỏi trang Tiến bộ | Route API còn lại vẫn vô hại vì chỉ đọc |
| Chuẩn hoá lúc ghi | Trả `service.ts` về `detectedError?.type ?? null` | Số đếm chẻ trở lại; gộp lúc đọc **vẫn** cứu được, nên đây là rollback an toàn |
| Toàn bộ taxonomy | `git revert` | Câu tiếng Việt lại chèn tiếng Anh và planner lại bỏ sót lỗi bị chẻ — chỉ làm khi có bằng chứng taxonomy phân loại sai |
