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

Ba biến AI đã đặt xong trong phiên này: `KIRAAI_API_KEY`, `KIRAAI_MODEL=claude-sonnet-4-6`, `KIRAAI_BASE_URL=https://vyceai.com/v1`.

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
