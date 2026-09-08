# Vận hành

## Local

`npm run type-check`, `npm test`, `npm run lint`, `npm run test:e2e`, `npm run build`, `npx prisma validate`, `npx prisma migrate status`.

E2E phải dùng `AI_PROVIDER=mock`, SQLite test riêng, local auth secret dành cho test. `prisma migrate deploy` + seed chỉ được chạy trên fixture DB do lần test tạo. Không chạy `db:reset`/seed với dev.db.

Brain engine: dùng bản local của repo Fitc84/brain4agent.old, `init_brain.js <projectRoot> --check`; chỉ ghi khi chẩn đoán yêu cầu. Bản nguồn còn đường dẫn máy tác giả trong managed rule; dùng binding local ghi ngoài block để không phá checksum engine. `.compact` cập nhật trạng thái thật, không gắn nhãn production/Grade A nếu chưa chứng minh.

## Deploy và rollback

Không deploy trong patch này. Render hiện cấp PostgreSQL trong khi Prisma schema/migrations SQLite; phải có kế hoạch migration và môi trường PostgreSQL riêng trước deployment. VieNeu cần shared TTS_API_KEY và private binding; không tải model nặng chỉ để xác nhận lint.

Rollback patch bằng đảo diff các file đã sửa, không xóa DB hoặc reset lịch sử. Không có schema migration mới.

| Lỗi vận hành | Xử lý |
|---|---|
| Port test đã dùng | Port E2E riêng; không kill server người dùng |
| Browser thiếu | Cài browser test qua Playwright nếu cần, ghi bằng chứng |
| Build/network fail | Phân loại môi trường/code; ghi giới hạn thật |
| Engine code 2 | Giữ dữ liệu, đọc findings; không vá tay managed blocks |

Bằng chứng baseline: Prisma schema valid, 2 migrations applied trên local. Kết quả cuối ghi TESTING-ACCEPTANCE.
