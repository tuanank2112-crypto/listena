# ListenAI

Ứng dụng tự học tiếng Anh AI-native cho người Việt. Mission, Lesson Coach và Daily Quest dẫn dắt vòng học: trả lời → phản hồi → sửa lỗi → evidence → mastery/memory → hoạt động tiếp theo. Bài học, trò chơi từ vựng và flashcards hỗ trợ luyện tập.

## Kiến trúc

Next.js 16.3.1 App Router, React 19, TypeScript, Auth.js Credentials/JWT, Prisma 6 và SQLite. Tutor dùng provider tương thích OpenAI hoặc fallback xác định; server giữ validator, điểm, trạng thái và evidence.

- Session/turn/intervention được lưu để tải lại hội thoại. `clientTurnId` chống ghi trùng.
- Evidence, mastery và learner memory ghi trong cùng transaction. Memory có kiểu dữ liệu được kiểm tra và chỉ bản tóm tắt giới hạn được đưa vào ngữ cảnh tutor.
- Session hoàn tất có đề xuất tiếp theo trong phản hồi API; giao diện mở Coach, Mission, Quest hoặc Mission luyện sửa lỗi có mục tiêu.
- Dashboard/progress dùng timeline gồm phiên AI, evidence, bài luyện và lượt ôn thẻ. Tổng phút tuần tính từ toàn bộ phiên hoàn tất trong bảy ngày, độc lập với giới hạn 50 mục hiển thị.

Chi tiết: [Learning runtime](docs/learning.md), [AI architecture](docs/AI_FIRST_ARCHITECTURE.md), [Plan 03 và nghiệm thu](planning/03_2026-09-08_learning-loop-completion/plan.md).

## Chạy local

Dùng Node.js theo `.nvmrc`. Sao chép `.env.example` thành `.env`, đặt `DATABASE_URL` tới SQLite local và cấu hình auth secret.

```bash
npm install
```

Chỉ với database demo mới: `npm run db:push`, `npm run db:seed`, rồi `npm run dataset:import`. Seed xóa dữ liệu hiện có; không chạy trên database có tiến độ người học. Với database đang dùng, áp dụng migrations phù hợp sau khi sao lưu.

```bash
npm run dev
```

Mở `http://localhost:3000`. Database demo có `learner@example.com` và `teacher@example.com`, mật khẩu `demo1234`.

## Dataset và hoạt động học

Dataset gồm 5 unit, 116 từ vựng, 10 chủ điểm ngữ pháp, 54 bộ bài tập và 200 knowledge chunks. `npm run dataset:import` nhập idempotent. Nội dung Educaplay tham khảo giữ DRAFT, không thuộc curriculum học viên.

Game Hub ưu tiên Mission và Daily Quest; Quick comeback gồm chọn nhanh, ghép cặp, nghe và viết. Curriculum dựa vào trạng thái PUBLISHED, không phụ thuộc tên khóa học.

## AI provider

Mặc định dùng mock/fallback với retrieval từ dataset, không cần API key. Cấu hình provider bên ngoài bằng:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=your-model
OPENAI_BASE_URL=https://api.openai.com/v1
```

Provider lỗi hoặc trả dữ liệu không hợp lệ sẽ dùng fallback. Eval mock kiểm hợp đồng/phase/grounding nội bộ; không chứng minh hiệu quả học tập với người học thật.

## Giọng đọc

Tiếng Anh dùng Web Speech API và giọng hệ thống. Kokoro không đăng ký trong runtime; script `tts:prebuild` và thư viện Kokoro còn là legacy, không cần chạy để dùng app.

Tiếng Việt dùng VieNeu sidecar; khi không khả dụng, speech controller thử Web Speech nếu thiết bị có giọng phù hợp.

- `GET/POST /api/tts/vie` yêu cầu đăng nhập.
- App và sidecar phải có cùng `TTS_API_KEY`. Thiếu cấu hình sẽ từ chối phục vụ.
- App dùng `VIENEU_URL` (mặc định `http://localhost:8001`). Có thể để trống `VIENEU_DEFAULT_VOICE` để lấy giọng từ sidecar.
- Cache mới của Next nằm ở `TTS_PROXY_CACHE_DIR` (mặc định `tts-service/cache/proxy`), ngoài `public/`; phản hồi audio dùng `Cache-Control: private, no-store`.
- Cache riêng của sidecar dùng `TTS_CACHE_DIR`; Docker đặt `/app/cache`. Các file public audio được sinh trước đây không tự bị xóa.

Chạy sidecar trực tiếp với cùng secret trong môi trường shell:

```bash
cd tts-service
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
```

Hoặc `docker compose build tts` rồi `docker compose up tts`. Compose truyền `TTS_API_KEY` và chỉ publish cổng TTS trên loopback. Sidecar dùng `vieneu==3.3.0`, khởi tạo model lúc startup; chỉ chạy một worker. Chất lượng giọng và tốc độ audio thực tế cần kiểm riêng với model đã cài.

## Kiểm tra và triển khai

```bash
npm test
npm run type-check
npm run lint
npm run eval
npx prisma validate
npm run build
npm run test:e2e
```

E2E dùng database SQLite mới trong thư mục temp, tự chạy migrations/seed/import với provider mock; không dùng database người học. Không chạy build và E2E đồng thời vì cùng dùng `.next`. Bằng chứng và giới hạn nghiệm thu cập nhật trong [TESTING-ACCEPTANCE](planning/03_2026-09-08_learning-loop-completion/specs/TESTING-ACCEPTANCE.md).

`render.yaml` và dịch vụ PostgreSQL trong Compose là cấu hình hạ tầng chưa đồng bộ với SQLite hiện tại. Chưa triển khai production; cần kế hoạch chuyển provider, migration, backup/restore và cấu hình dịch vụ trước khi sử dụng.
