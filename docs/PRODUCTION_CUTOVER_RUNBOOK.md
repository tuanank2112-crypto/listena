# Runbook dựng Production (Vercel + Turso) — soạn 2026-09-17

Trạng thái: **CHỜ THÔNG TIN ĐĂNG NHẬP TURSO**. Mọi bước khác đã sẵn sàng.

Mục tiêu: đưa `https://listena-n-listen-ai.vercel.app` từ trạng thái chưa cấu hình database sang chạy thật với Turso và gia sư AI hoạt động.

---

## 0. Vì sao Production hiện không chạy được

`vercel env ls production` cho thấy **không có** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` và `APP_RUNTIME`.

Theo [`database-config.ts`](../src/lib/database-config.ts): khi tiến trình thấy biến `VERCEL_*` mà thiếu `APP_RUNTIME`, hàm `resolveApplicationRuntime` gọi `missingConfiguration()` và **fail closed**. Nghĩa là mọi request chạm database đều lỗi, không phải hỏng âm thầm mà chặn có chủ đích.

Vì vậy deploy Production trước khi cấp database là công bố một site lỗi toàn bộ.

## 1. Thứ duy nhất còn thiếu

Đăng nhập Turso. CLI đã có sẵn trong WSL tại `~/.turso/turso` nhưng chưa đăng nhập.

Hai cách, chọn một:

**Cách A — dán token một lần (nhanh nhất).** Mở https://api.turso.tech?redirect=false, đăng nhập, trang sẽ hiện một token. Gửi token đó cho tôi.

**Cách B — tự đăng nhập trong WSL.** Chạy:

```bash
wsl -d Ubuntu -- bash -lc "~/.turso/turso auth login"
```

Sau đó báo tôi, tôi dùng phiên đăng nhập đã lưu.

## 2. Các bước tôi sẽ chạy sau khi có quyền

### 2.1 Tạo database Production riêng

```bash
turso db create listena-production-20260917 --group listena-staging
turso db show listena-production-20260917 --url
turso db tokens create listena-production-20260917
```

**BẮT BUỘC** tạo database mới. **CẤM** dùng lại `listena-staging-20260911` (bản staging chuẩn của Plan07) hoặc `listena-preview-20260912` (bản dùng một lần cho Preview). Plan07 cấm thăng cấp staging thành production.

### 2.2 Áp schema

10 migration trong [`prisma/migrations/`](../prisma/migrations) là SQL thuần, áp tuần tự theo thứ tự tên thư mục:

```bash
for d in prisma/migrations/*/; do
  turso db shell listena-production-20260917 < "$d/migration.sql"
done
turso db shell listena-production-20260917 "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Kỳ vọng: 31 bảng, `integrity_check=ok`, `foreign_key_check` không trả dòng nào.

#### Lưu ý Plan13 (D2): migration `20260916000000_release_hardening_mutations` KHÔNG additive

File này DROP + tạo lại `VocabularyMastery` (tạo `new_VocabularyMastery` → INSERT SELECT → DROP → RENAME) chỉ để thêm cột `revision INTEGER NOT NULL DEFAULT 0`. Nó **đã áp thành công trên Production ngày 2026-09-17 16:30** nên rủi ro còn lại chỉ nằm ở database mới hoặc khi quay lui. Với database mới, áp riêng file này trong **một transaction** và dừng ngay ở lỗi đầu tiên, để không bao giờ tồn tại trạng thái "đã DROP nhưng chưa RENAME":

```bash
{ printf '.bail on\nBEGIN;\n'; cat prisma/migrations/20260916000000_release_hardening_mutations/migration.sql; printf 'COMMIT;\n'; } \
  | turso db shell listena-production-20260917
```

Chi tiết quay lui: xem mục 4.

### 2.3 Tạo chủ sở hữu giáo trình

[`scripts/import-dataset.ts:52`](../scripts/import-dataset.ts) yêu cầu tồn tại một user vai trò `TEACHER`. Production tạo một tài khoản hệ thống với mật khẩu băm không dùng được, để không ai đăng nhập bằng nó.

### 2.4 Nhập giáo trình

```bash
APP_RUNTIME=vercel \
TURSO_DATABASE_URL=<url> TURSO_AUTH_TOKEN=<token> \
npm run dataset:import
```

Kỳ vọng theo bản ghi Plan05: 5 bài học, 116 từ vựng, 20 đoạn, 54 bài tập.

**CẤM** chạy `npm run db:seed` trên Production: seed xoá dữ liệu hiện có.

### 2.5 Đặt biến môi trường Production

| Biến | Giá trị |
|---|---|
| `TURSO_DATABASE_URL` | URL từ bước 2.1 |
| `TURSO_AUTH_TOKEN` | token từ bước 2.1 |
| `APP_RUNTIME` | `vercel` |
| `MIGRATION_WRITE_MODE` | `enabled` |
| `NEXTAUTH_URL` | `https://listena-n-listen-ai.vercel.app` |

Ba biến AI đã đặt xong trong phiên này (17/09 chiều): `KIRAAI_API_KEY`, `KIRAAI_MODEL=claude-sonnet-4-6`, `KIRAAI_BASE_URL=https://vyceai.com/v1`.

**Cập nhật 17/09 tối — BẮT BUỘC trước lần deploy kế tiếp:** provider Kira đã bị gỡ khỏi code (chỉ còn Vyce). Biến mới là `AI_PROVIDER=vyce`, `VYCE_API_KEY`, `VYCE_MODEL=claude-sonnet-4-6`, `VYCE_BASE_URL=https://vyceai.com/v1` cho CẢ Production lẫn Preview (kiểu `encrypted`, không phải `sensitive`). Phải `vercel env rm` bốn biến cũ (`AI_PROVIDER`, `KIRAAI_API_KEY`, `KIRAAI_MODEL`, `KIRAAI_BASE_URL`) rồi `vercel env add` bốn biến mới. Nếu còn `AI_PROVIDER=kira` hoặc `KIRAAI_API_KEY`, ứng dụng fail-closed: log lỗi "AI provider configuration is stale" và mọi tính năng AI báo chưa sẵn sàng.

Lưu ý thao tác: `vercel env add` **không ghi đè** biến đã tồn tại, phải `vercel env rm` trước.

### 2.6 Deploy

```bash
npx vercel deploy --prod
```

### 2.7 Nghiệm thu trên Production thật

| Kiểm tra | Kỳ vọng |
|---|---|
| Trang chủ và trang đăng nhập | 200 |
| Đăng ký một tài khoản thật | tạo được, có hàng trong Turso |
| Đăng nhập | có phiên |
| `/api/learner/next-action` | 200, `decisionVersion: p11-v1` |
| Bấm Học cùng AI | 201, log provider `status=stop` |
| Gửi một lượt học viên | 201, có coaching và phát hiện lỗi |
| Đọc lại Turso | đúng số hàng, không rác |

### 2.8 Ghi nhận

Ghi receipt vào ledger Plan12, cập nhật não, đánh dấu cổng Plan07 `server enabled`, và chỉ khi đó mới bàn tới việc nâng phiên bản.

## 3. Rủi ro đã cân nhắc

- **Không có bản sao lưu để quay lui trên một database mới.** Production khởi đầu rỗng, nên không có dữ liệu người học nào để mất. Rủi ro thật chỉ xuất hiện sau khi có người dùng thật; từ lúc đó Plan07 yêu cầu hòa giải dữ liệu trước khi quay về Cloudflare.
- **`MIGRATION_WRITE_MODE=enabled` mở hàng rào ghi.** Đây là điều kiện bắt buộc để đăng ký và học được, nhưng cũng nghĩa là Production nhận ghi thật từ lúc đó.
- **Chưa có tên miền riêng.** Vercel chỉ có `listena-n-listen-ai.vercel.app`; `NEXTAUTH_URL` phải khớp đúng chuỗi này nếu không đăng nhập sẽ hỏng.
- **Dữ liệu D1 cũ không được nhập.** Cloudflare Worker và D1 vẫn là tài sản quay lui theo Plan07. Production mới bắt đầu rỗng; nếu muốn mang dữ liệu người học cũ sang thì đó là một quyết định riêng cần xuất bản ghi D1 và kiểm chứng.

## 4. Rollback và migration không additive (bổ sung Plan13 SPEC-P134 §3)

Từ Plan13 mọi migration mới **bắt buộc additive** (`ALTER TABLE ... ADD COLUMN ... DEFAULT`, không DROP). Ngoại lệ lịch sử duy nhất là `20260916000000_release_hardening_mutations` (mục 2.2): nó tạo lại bảng `VocabularyMastery` nên nếu bị ngắt giữa chừng trên một database áp **không** có transaction thì bảng SRS có thể biến mất.

- **Đã áp ở đâu:** Production `listena-production-20260917` (16:30 ngày 2026-09-17, thành công; `PRAGMA integrity_check=ok`, `foreign_key_check` rỗng). Không cần làm gì thêm trên Production.
- **Áp trên database mới:** dùng lệnh transaction + `.bail on` ở mục 2.2. `PRAGMA foreign_keys=OFF` bên trong file là no-op trong transaction; điều đó chấp nhận được vì không bảng nào tham chiếu tới `VocabularyMastery` và `defer_foreign_keys` vẫn có hiệu lực.
- **Nếu lần áp bị ngắt giữa chừng (không có transaction):** kiểm tra trước khi sửa, không chạy lại file mù:
  ```sql
  SELECT name FROM sqlite_master WHERE type='table' AND name IN ('VocabularyMastery','new_VocabularyMastery');
  ```
  - Chỉ còn `new_VocabularyMastery` (đã DROP, chưa RENAME): `ALTER TABLE "new_VocabularyMastery" RENAME TO "VocabularyMastery";` rồi tạo lại hai index `VocabularyMastery_userId_nextReviewAt_idx` và `VocabularyMastery_userId_vocabularyItemId_key` đúng như trong file migration; sau đó áp phần còn lại của file (các `CREATE INDEX` phía dưới `RedefineTables`).
  - Còn cả hai bảng (INSERT SELECT xong nhưng chưa DROP): `DROP TABLE "new_VocabularyMastery";` rồi áp lại toàn bộ file trong transaction.
- **Quay lui code về trước Plan12/Plan13:** không cần quay lui schema; cột `revision` (và mọi cột Plan13 có DEFAULT) vô hại với code cũ. **CẤM** DROP cột/bảng để "dọn" khi quay lui.
- **Kiểm chứng sau bất kỳ thao tác nào ở trên:** chạy verifier chỉ-đọc, hợp đồng kỳ vọng được suy ra từ chính `prisma/migrations/**` (không còn hằng số 27/48/45):
  ```bash
  MIGRATION_TARGET_DATABASE_URL=<url> MIGRATION_TARGET_AUTH_TOKEN=<token> npm run migration:verify
  npm run migration:verify -- --self-test   # tự kiểm verifier trên SQLite tạm, phải exit 0
  ```
