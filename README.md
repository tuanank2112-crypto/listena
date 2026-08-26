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

## Giọng đọc

Tiếng Anh dùng kokoro-js chạy hoàn toàn trong trình duyệt với Kokoro-82M q8, ở Web Worker để không chặn UI. Model chỉ tải khi người học phát âm thanh; audio được cache trong IndexedDB bằng khóa băm. Voice mặc định là bf_emma trong env.example và đồng nhất với prebuild Node.

Chạy npm run tts:prebuild để tạo 116 audio từ vựng vào TTS_CACHE_DIR, mặc định public/tts. Nhánh vi hiện cảnh báo và không phát âm thanh vì tutor chưa có consumer speech. Không có sidecar VieNeu trong phạm vi này.

### Kiểm tra thủ công

1. Chạy npm run dev, đăng nhập learner@example.com / demo1234.
2. Mở /learner/games, chọn Nghe và viết, bấm loa; Network không có URL, query hoặc header chứa đáp án.
3. Mở flashcard, bấm loa hai lần; lần tiếp theo được trả từ cache IndexedDB listena-kokoro-audio.
4. Trong bài học, bấm hai từ liên tiếp; âm thanh cũ phải bị dừng.
5. Chặn Web Worker trong DevTools để xác nhận ứng dụng không sập và Web Speech chỉ là fallback cuối.

## Kiểm tra

```bash
npm run type-check
npm test
npm run build
```
