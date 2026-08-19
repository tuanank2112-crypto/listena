# ListenAI

Sản phẩm tự học tiếng Anh A2 với bài học ngắn, trò chơi từ vựng, chấm bài, flashcard SRS và gia sư AI có truy xuất dữ liệu giáo trình.

## Chạy local

```bash
npm install
npm run db:push
npm run db:seed
npm run dataset:import
npm run dev
```

Mở `http://localhost:3000`.

Tài khoản demo:

- Học viên: `learner@example.com` / `demo1234`
- Giáo viên: `teacher@example.com` / `demo1234`

## Dataset

`npm run dataset:import` nhập idempotent 5 unit TATQHP1:

- 116 từ vựng đã chuẩn hóa nghĩa
- 10 chủ điểm ngữ pháp
- 54 bộ bài tập
- 200 knowledge chunks cho tutor

Bài Educaplay Đà Nẵng chỉ được dùng để đối chiếu format gameplay/audio và được giữ ở trạng thái `DRAFT`, không xuất hiện trong curriculum học viên.

## Game Hub

Trang `/learner/games` có ba chế độ dùng từ vựng thật theo từng unit:

- Chọn nhanh
- Ghép cặp
- Nghe & viết

Mỗi session có timer, tim, điểm, feedback và chơi lại.

## Gia sư AI

Mặc định tutor dùng retrieval nội bộ từ dataset, không cần API key. Để dùng model tương thích OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Nếu provider lỗi, hệ thống tự fallback về dataset retrieval.

## Kiểm tra

```bash
npm run type-check
npm test
npm run build
```
