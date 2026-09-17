# SPEC-P130 — Đăng nhập, đăng xuất, quên mật khẩu, xác minh, phân quyền

Findings gốc: A1 (P1), A2, A3 (P2), role frozen, teacher pages/PUT, TEACHER ghi learner API, CSP/HSTS (P3). Ưu tiên user: cao nhất.

## Contract

### 1. Quên mật khẩu & gửi lại xác minh (A1)
- `POST /api/account/password-reset/request` và `POST /api/account/verification/request`:
  - BẮT BUỘC trả **202 `{accepted:true}`** cho mọi email hợp lệ, cùng thân, cùng header.
  - BẮT BUỘC thời gian phản hồi **không phụ thuộc** vào việc email tồn tại: (a) mọi việc I/O (tạo token, gửi Resend) chạy **sau khi** response được quyết định, qua `after()` của `next/server` (Next 16: xem `node_modules/next/dist/docs` mục `after`); (b) toàn bộ handler pad tới ≥ 400 ms tính từ `performance.now()` lúc vào handler (`await sleep(max(0, 400 - elapsed))`).
  - Với email không tồn tại vẫn chạy một `hash`/`findUnique` giả có chi phí tương đương (dummy bcrypt compare với hash cố định) để san bằng CPU.
  - Cooldown 60s hiện có giữ nguyên nhưng **không** được lộ qua status (đã 202).
- Test: unit đo `Date.now()` chênh lệch giữa email tồn tại/không tồn tại < 50 ms với Resend mock chậm 300 ms; E2E forgot-password → link → reset → login mới thành công.

### 2. Đăng ký (A3)
- `POST /api/register`: email đã tồn tại → **202 `{accepted:true, verificationEmailSent:true}`** giống email mới, đồng thời gửi mail "tài khoản đã tồn tại, đây là link đặt lại mật khẩu" (template mới `account-exists`). CẤM 409.
- Trang register hiển thị cùng thông điệp "Kiểm tra hộp thư" cho cả hai.
- Validation lỗi (400) giữ nguyên vì không lộ tài khoản.

### 3. Throttle đăng nhập (A2)
- Bảng `AuthAttempt` (01-CONTRACTS). Trong `authorize()` của `src/server/auth/config.ts`:
  1. Tính `emailKey = sha256(email)`; `ipKey = sha256(ip)` với ip lấy từ header `x-forwarded-for` đầu tiên hoặc `x-real-ip`; thiếu → `"unknown"`.
  2. Nếu `lockedUntil > now` cho email **hoặc** ip → ném `CredentialsSignin` với `code = "auth_locked"`; client hiện "Đăng nhập tạm khoá, thử lại sau N phút" (N từ `/api/auth/lockout?email=` **không** làm — chỉ hiện "vài phút"). CẤM phân biệt thông điệp giữa tài khoản tồn tại/không.
  3. Sai mật khẩu hoặc không tồn tại → `failedCount++` (reset cửa sổ nếu `windowStartedAt` > 10 phút); đạt ngưỡng (email 5 / ip 20) → `lockedUntil = now + 15 phút`.
  4. Thành công → xoá row email.
  - Cập nhật bằng một câu libSQL `INSERT ... ON CONFLICT DO UPDATE` (atomic).
- Test: 5 lần sai → lần 6 với mật khẩu **đúng** vẫn bị khoá; sau 15 phút (fake timer) mở lại; row ip độc lập.

### 4. Đăng xuất
- `handleAppSignOut` (giữ) phải: `clearOwnerIntents(ownerId)` → `signOut({ redirect: false })` → `router.replace("/")` → `router.refresh()`. Không dùng `callbackUrl` (tránh open redirect surface).
- Sau đăng xuất, `GET /learner/*` phải 302 về `/login` (E2E).
- Thêm nút đăng xuất trên mobile menu (hiện chỉ desktop? worker kiểm; nếu thiếu, thêm).

### 5. Role refresh
- JWT callback: nếu `Date.now() - (token.roleCheckedAt ?? 0) > 5 phút` → `prisma.user.findUnique({select:{role,emailVerifiedAt}})`; user không còn → trả `null` (đăng xuất); cập nhật `token.role`, `token.isEmailVerified`, `token.roleCheckedAt`. Lỗi DB → giữ token cũ (không khoá người dùng vì DB chập chờn) nhưng log warn.

### 6. Teacher
- `PUT /api/teacher/lesson`: validate bằng zod `{ id: uuid, action: enum["review","publish"] }`; 400 nếu sai.
- Trang `teacher/lessons`, `teacher/courses`, `teacher/dashboard`: chỉ dữ liệu `createdById = session.user.id` (ADMIN thấy tất cả). Dashboard đếm learner chỉ khi ADMIN.
- Learner API (`/api/attempt`, `/api/flashcard`, `/api/learning-sessions/**`, `/api/game-runs/**`, `/api/tutor`): từ chối role TEACHER với 403 `{code:"ROLE_FORBIDDEN"}`; ADMIN được phép. Helper chung `requireLearnerRole(session)` trong `src/server/auth/roles.ts`.

### 7. Headers
- `next.config.ts`: thêm `Strict-Transport-Security: max-age=63072000; includeSubDomains` (chỉ khi `process.env.NODE_ENV === "production"`) và `Content-Security-Policy` ở chế độ **report-only trước**: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://vyceai.com; media-src 'self' blob:; frame-ancestors 'none'`. Worker kiểm tra dev build không bị chặn; nếu Next dev cần `'unsafe-eval'` thì chỉ thêm khi `NODE_ENV !== "production"`.

## Vùng cấm
- CẤM global JWT revocation, CAPTCHA, đổi thư viện auth.
- CẤM lộ tồn tại tài khoản qua bất kỳ kênh nào (status, thân, thời gian, thông điệp khoá).

## Bảng lỗi

| Lỗi | Hành vi |
|---|---|
| DB lỗi trong throttle | Fail **open** cho đăng nhập (không khoá oan) nhưng log error; test bao phủ |
| Resend lỗi trong `after()` | Log warn với `requestId`; response đã 202 |
| Role refresh DB lỗi | Giữ token cũ, log |

## Nghiệm thu
- Unit: throttle (5 case), timing (2 case), register-exists (2 case), role refresh (3 case), requireLearnerRole (3 case).
- E2E mới `e2e/auth-flows.spec.ts`: register → verify link (lấy token từ DB tạm) → login → logout → 302; forgot → reset → login; 6 lần sai → khoá; TEACHER gọi `/api/attempt` → 403.
