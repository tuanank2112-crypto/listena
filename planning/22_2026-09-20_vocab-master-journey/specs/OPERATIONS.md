# OPERATIONS — Triển khai, vận hành, rollback

## 1. Thứ tự BẮT BUỘC — migration trước, deploy sau

Đây là kế hoạch đầu tiên từ Plan13 có **đổi schema**, nên thứ tự không còn tuỳ ý:

1. `npm run type-check`
2. `npx eslint .`
3. `npx vitest run`
4. `npm run build`
5. `npx playwright test`
6. Commit, push `origin/codex/vercel-turso-migration`
7. **Áp migration lên Turso production** — `20260920030000_plan22_lesson_journey`
8. Xác minh: bảng `LessonJourneyProgress` tồn tại, `AdaptiveGameRun` có cột `lessonId`, `PRAGMA integrity_check` ok, `PRAGMA foreign_key_check` rỗng
9. `npx vercel --prod --yes --scope n-listen-ai`

**Deploy trước khi áp migration sẽ làm hỏng production**: mã mới truy vấn một bảng và một cột chưa tồn tại, và mọi trang bài học sẽ lỗi. Không có đường tắt nào cho bước 7.

**BẮT BUỘC** `--scope n-listen-ai` ở bước 9; thiếu scope thì CLI báo `Not authorized`.

## 2. Vì sao thứ tự này an toàn

Migration **cộng thêm hoàn toàn**: một bảng mới và một cột **nullable** cùng hai index. Bản deploy **đang chạy** không biết gì về chúng và vẫn chạy đúng trên schema mới — nên giữa bước 7 và bước 9 production vẫn bình thường.

**CẤM** chạy `prisma migrate dev` hay `prisma db push` lên bất kỳ DB nào của người dùng, kể cả `prisma/dev.db`. File migration được viết tay đúng vì lý do đó.

## 3. E2E và database tạm

`e2e/setup.ts` chạy `prisma migrate deploy` trên SQLite tạm nên nó tự có schema mới. Không cần làm gì thêm.

## 4. Giám sát sau deploy

- `GET /learner/lessons` chưa đăng nhập cho `307` về `/login`.
- `GET /api/learner/lessons/<id>/journey` ẩn danh cho `401`; id không có thật cho `404` (sau khi đăng nhập).
- Một lượt chơi tự do trên `/learner/games` vẫn tạo được — đây là phép thử rằng cột `lessonId` nullable không làm hỏng đường cũ.

## 5. Rollback

| Muốn bỏ | Cách | Hệ quả |
|---|---|---|
| Dải hành trình | Bỏ `<LessonJourneyBand />` khỏi `lesson-client.tsx` | Route API còn lại vô hại vì chỉ đọc và ghi một bước |
| Combo | Bỏ `progress` khỏi kết quả và trả lại điểm client | Không mất dữ liệu; combo vốn chỉ là cách nhìn |
| Game gắn bài | Bỏ `lessonId` khỏi contract | Lượt cũ giữ `lessonId` đã lưu, vô hại |
| Toàn bộ | `git revert` | **KHÔNG** rollback schema. Bảng và cột thừa không hại gì; xoá chúng mới là thao tác nguy hiểm. |

**BẮT BUỘC:** rollback mã **không** kèm rollback schema. Một cột nullable thừa và một bảng rỗng không gây hại; `DROP` thì có.
