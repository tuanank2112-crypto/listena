# ListenAI

Ứng dụng tự học tiếng Anh AI-native cho người Việt. Mission, Lesson Coach và Daily Quest dẫn dắt vòng học: trả lời → phản hồi → sửa lỗi → evidence → mastery/memory → hoạt động tiếp theo. Bài học, trò chơi từ vựng và flashcards hỗ trợ luyện tập.

## Kiến trúc

Next.js 16.3.5 App Router, React 19, TypeScript, Auth.js Credentials/JWT, Prisma 6 và SQLite (local/test) hoặc Turso/libSQL (hosted). Tutor dùng provider tương thích (Kira hoặc OpenAI); server giữ validator, điểm, trạng thái và evidence.

- Session/turn/intervention được lưu để tải lại hội thoại. `clientTurnId` chống ghi trùng.
- Evidence, mastery và learner memory ghi trong cùng transaction. Memory có kiểu dữ liệu được kiểm tra và chỉ bản tóm tắt giới hạn được đưa vào ngữ cảnh tutor.
- Session hoàn tất có đề xuất tiếp theo trong phản hồi API; giao diện mở Coach, Mission, Quest hoặc Mission luyện sửa lỗi có mục tiêu.
- Dashboard/progress dùng timeline gồm phiên AI, evidence, bài luyện và lượt ôn thẻ. Tổng phút tuần tính từ toàn bộ phiên hoàn tất trong bảy ngày, độc lập với giới hạn 50 mục hiển thị.

Chi tiết: [Learning runtime](docs/learning.md), [AI architecture](docs/AI_FIRST_ARCHITECTURE.md), [Plan 03 và nghiệm thu](planning/03_2026-09-08_learning-loop-completion/plan.md).

## Chạy local

Dùng Node.js theo `.nvmrc` (Node 24). Sao chép `.env.example` thành `.env`, đặt `DATABASE_URL` tới SQLite local và cấu hình auth secret.

```bash
npm install
```

Chỉ với database demo mới: `npm run db:push`, `npm run db:seed`, rồi `npm run dataset:import`. Seed xóa dữ liệu hiện có; không chạy trên database có tiến độ người học. Với database đang dùng, áp dụng migrations phù hợp sau khi sao lưu (`dev.db.bak`).

```bash
npm run dev
```

Mở `http://localhost:3000`. Database demo có `learner@example.com` và `teacher@example.com`, mật khẩu `demo1234`.

## Dataset và hoạt động học

Dataset gồm 5 unit, 116 từ vựng, 10 chủ điểm ngữ pháp, 54 bộ bài tập và 200 knowledge chunks. `npm run dataset:import` nhập idempotent. Nội dung Educaplay tham khảo giữ DRAFT, không thuộc curriculum học viên.

Game Hub ưu tiên Mission và Daily Quest; Quick comeback gồm chọn nhanh, ghép cặp, nghe và viết. Curriculum dựa vào trạng thái PUBLISHED, không phụ thuộc tên khóa học.

## AI provider

Hỗ trợ hai provider bên ngoài: KiraAI (Chat Completions) và OpenAI (Responses). Không có provider mock trong runtime. Khi provider chưa cấu hình hoặc gặp sự cố, server trả về phản hồi lỗi typed/unavailable tường minh (hoặc mẫu nhiệm vụ xác định cho mission):

```env
AI_PROVIDER=kira
KIRAAI_API_KEY=...
KIRAAI_MODEL=glm-5.3-flash-free
KIRAAI_BASE_URL=https://kiraai.vn/api/v1
```

Hoặc OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Giọng đọc

Tiếng Anh dùng Web Speech API phía trình duyệt và giọng hệ thống. Thư viện Kokoro đã được loại bỏ hoàn toàn khỏi dự án.

Tiếng Việt dùng private VieNeu TTS sidecar (`vieneu==3.3.0`, speed cố định 1.0); khi không khả dụng, speech controller thử Web Speech nếu thiết bị có giọng phù hợp.

- `GET/POST /api/tts/vie` yêu cầu đăng nhập.
- App và sidecar phải có cùng `TTS_API_KEY`. Thiếu cấu hình sẽ từ chối phục vụ (503).
- App dùng `VIENEU_URL` (mặc định `http://localhost:8001`). Có thể để trống `VIENEU_DEFAULT_VOICE` để lấy giọng từ sidecar.
- Next.js audio cache nằm ở `TTS_PROXY_CACHE_DIR` (mặc định `tts-service/cache/proxy`), ngoài `public/`; phản hồi audio dùng `Cache-Control: private, no-store`.
- Sidecar chỉ lắng nghe trên loopback (`127.0.0.1:8001`) và trả về lỗi opaque khi synthesis thất bại.

Chạy sidecar trực tiếp với Python 3.11 trong môi trường shell:

```bash
cd tts-service
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
```

Hoặc `docker compose up tts`. Compose truyền `TTS_API_KEY` và chỉ publish cổng TTS trên loopback (`127.0.0.1:8001`). Sidecar dùng `vieneu==3.3.0`, khởi tạo model lúc startup; chỉ chạy một worker.

## Kiểm tra và CI

```bash
npm test                      # Chạy toàn bộ Vitest unit & integration tests
npm run test:coverage         # Đo độ phủ kiểm thử với v8
npm run type-check            # Kiểm tra kiểu TypeScript
npm run lint                  # Kiểm tra ESLint (0 errors, warnings <= 32)
npx prisma validate           # Xác thực schema Prisma
npm run eval:learning         # Đánh giá chất lượng Socratic & sư phạm (offline / live)
npm run pilot:analyze         # Công cụ phân tích cohort thử nghiệm có consent
npm run test:e2e              # Chạy Playwright E2E trên database SQLite tạm
```

E2E dùng database SQLite mới trong thư mục temp, tự chạy migrations/seed/import; không dùng database người học. Không chạy build và E2E đồng thời vì cùng dùng `.next`.

## Hạ tầng, vận hành và phát hành (1.0.0)

- **Mục tiêu triển khai hosted:** Vercel + Turso (libSQL) theo lộ trình Plan 07, 09, 10, 11, 12.
- **Dự phòng & Rollback:** Cloudflare Worker + D1 là phương án rollback lịch sử. Kịch bản khôi phục và kiểm tra tính toàn vẹn chạy qua `npx tsx scripts/verify-backup-restore.ts`.
- **Ứng phó sự cố:** Tham khảo [docs/RUNBOOK_INCIDENT.md](docs/RUNBOOK_INCIDENT.md) cho 4 kịch bản (Database unavailable, AI provider outage, Email delivery outage, Secret leak).
- **Đánh giá sư phạm & Pilot:** Tham khảo [eval/LEARNING_EVALUATION.md](eval/LEARNING_EVALUATION.md) và [docs/PILOT_PROGRAM_SPEC.md](docs/PILOT_PROGRAM_SPEC.md).


