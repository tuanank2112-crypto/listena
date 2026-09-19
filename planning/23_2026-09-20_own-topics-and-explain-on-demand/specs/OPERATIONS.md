# OPERATIONS — Triển khai, vận hành, rollback

## 1. Thứ tự BẮT BUỘC

1. `npm run type-check`
2. `npx eslint .`
3. `npx vitest run`
4. `npm run build`
5. `npx playwright test`
6. Commit, push `origin/codex/vercel-turso-migration`
7. **Áp migration lên Turso production**:
   `npx tsx scripts/apply-turso-migration.ts --migration 20260920080000_plan23_learner_mission_scenarios --check`, xem báo cáo, rồi chạy lại **bỏ `--check`**
8. Xác minh: bảng `LearnerMissionScenario` tồn tại, `integrity_check` ok, `foreign_key_check` rỗng
9. `npx vercel --prod --yes --scope n-listen-ai`

**Deploy trước khi áp migration sẽ làm hỏng production**: trang Trò chơi gọi `GET /api/learner/mission-scenarios`, và route đó truy vấn một bảng chưa tồn tại.

Credential lấy bằng `vercel env pull --environment=production` — trên **Production** `TURSO_*` là loại `Config` nên đọc được (trên Preview chúng là `Secret`; đừng suy từ môi trường này sang môi trường kia). Xoá file kéo về ngay sau khi dùng.

## 2. Vì sao thứ tự này an toàn

Migration **chỉ tạo một bảng mới**. Bản deploy đang chạy không biết gì về nó và vẫn chạy đúng, nên giữa bước 7 và bước 9 production vẫn bình thường.

**CẤM** chạy `prisma migrate dev` hay `db push` lên bất kỳ DB người dùng nào, kể cả `prisma/dev.db`. File migration viết tay đúng vì lý do đó.

## 3. Giám sát sau deploy

- `GET /api/learner/mission-scenarios` ẩn danh ⇒ `401`.
- `DELETE /api/learner/mission-scenarios/<uuid-bịa>` khi đã đăng nhập ⇒ `404`.
- Một lượt Mission trên **chủ đề có sẵn** vẫn bắt đầu được — phép thử rằng việc nới `MissionScenarioKey` không làm hỏng đường cũ.
- Tạo **một** chủ đề thật bằng AI và vào vai nó. Đây là thứ E2E **không** phủ (E2E gieo sẵn dữ liệu để khỏi tốn lượt AI), nên phải thử tay một lần.
  - **2026-09-20:** đường này đã chạy thật với Vyce **ở local** (`LISTENAI_LIVE_AI_PROBE=1`, xem `TESTING-ACCEPTANCE.md` mục 3) và bắt được một lỗi thật đã sửa. Trên **production** vẫn chưa chạy: đăng nhập bị từ chối mã `credentials` — mật khẩu tài khoản kiểm thử đã đổi (nhiều khả năng user tự đổi sau khi được nhắc rằng nó đã đi qua lịch sử chat, tức họ làm đúng). **Cần user cho mật khẩu hiện tại**, hoặc tự chạy phép thử này.
  - Production đang chạy bản **chưa** có `clampGeneratedScenarioLists`, nên tới khi deploy lại thì khoảng **2/15** lượt tạo chủ đề vẫn có thể trả `503`.

## 4. Rollback

| Muốn bỏ | Cách | Hệ quả |
|---|---|---|
| Khu "Chủ đề của bạn" | Bỏ `<MyScenarios />` khỏi `games-client.tsx` | Route còn lại vô hại; chủ đề đã tạo vẫn chơi được qua link |
| Nút giải nghĩa | Trả khối Coach về dạng luôn mở | Lời giải thích lại tự hiện, nhưng **không** tự đọc trừ khi khôi phục cả `voice-script.ts` |
| Chủ đề riêng | `git revert` | Khoá `custom-*` đã lưu trong `LearningSession.stateJson` sẽ không giải được nữa và rơi về chủ đề mặc định của `getMissionTemplate` — không vỡ, nhưng phiên cũ đổi bối cảnh |
| Schema | **KHÔNG** rollback | Một bảng thừa không hại gì; `DROP` thì có |
