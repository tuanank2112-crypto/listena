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

Bài Educaplay Đà Nẵng chỉ được dùng để đối chiếu format gameplay/audio và được giữ ở trạng thái `DRAFT`, không xuất hiện trong curriculum học viên và không phát audio.

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

Nếu provider lỗi, hệ thống tự fallback về dataset retrieval. Trả lời của tutor bằng tiếng Việt — nhánh giọng đọc tiếng Việt sẽ dùng VieNeu (xem dưới).

## Giọng đọc

ListenAI dùng kiến trúc **hai đường dẫn (dual-path)**:

### 1. Tiếng Anh — Voice hệ thống miễn phí

Mọi nội dung tiếng Anh (từ vựng, câu ví dụ, trò chơi Nghe & viết, flashcard) dùng Web Speech API với giọng hệ thống miễn phí:

- Bấm là phát ngay, không tải voice/model trên web.
- Không dùng Google voice vì thiếu cảm xúc/nhấn nhá.
- Ưu tiên Natural → Premium/Enhanced → Microsoft/Apple → voice hệ thống khác.

### 2. Tiếng Việt — VieNeu-TTS (sidecar)

Mọi nội dung tiếng Việt (feedback của tutor, chú giải nghĩa) dùng VieNeu:

- Sidecar FastAPI trong `tts-service/`, package `vieneu==3.3.0` (pin chính xác).
- `Vieneu(mode="v3turbo", precision="int8")` khởi tạo một lần, warm-up lúc startup.
- Next.js gọi sidecar qua API route nội bộ `/api/tts/vie` — **không expose public**.
- Xác thực giữa Next.js và sidecar bằng shared secret `TTS_API_KEY`.
- Audio cache trên **đĩa** (thư mục `TTS_CACHE_DIR`), trả header `Cache-Control: immutable`.
- Với sidecar down, ứng dụng vẫn chạy — chỉ mất audio tiếng Việt, không crash.

### Cấu hình môi trường

Xem `.env.example`:

```env
NEXT_PUBLIC_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
NEXT_PUBLIC_KOKORO_DEFAULT_VOICE=bf_emma
VIENEU_URL=http://localhost:8001
TTS_API_KEY=
TTS_CACHE_DIR=public/tts
KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
KOKORO_DEFAULT_VOICE=bf_emma
VIENEU_DEFAULT_VOICE=
```

### Prebuild audio

Chạy để sinh sẵn audio 116 từ vựng (Kokoro) và nội dung tiếng Việt (VieNeu) vào `public/tts`:

```bash
npm run tts:prebuild
```

Lệnh này tạo file `.wav` theo khóa cache, trình duyệt sẽ đọc từ `/tts/kokoro/<key>.wav` thay vì tổng hợp lại.

### Chạy sidecar VieNeu

```bash
cd tts-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
```

Hoặc dùng Docker (model bake vào image hoặc mount HuggingFace volume `HF_HOME`):

```bash
docker compose build tts
docker compose up tts
```

### Kiểm tra thủ công

1. Chạy `npm run dev` + sidecar VieNeu, đăng nhập `learner@example.com` / `demo1234`.
2. Mở `/learner/games`, chọn **Nghe và viết**, bấm loa → audio phát từ Kokoro (Network tab: request `/tts/kokoro/*.wav` hoặc IndexedDB).
3. Mở flashcard, bấm loa hai lần → lần hai trả từ cache IndexedDB `listena-kokoro-audio`.
4. Trong bài học, bấm hai từ liên tiếp → âm thanh cũ phải bị dừng.
5. Chặn Web Worker trong DevTools → ứng dụng không sập, Web Speech chỉ là fallback cuối.
6. Hỏi tutor bằng tiếng Việt → bấm nút loa trên phản hồi, audio phát từ VieNeu (header `X-TTS-Cache`, `X-TTS-Engine: vieneu-3.3.0`).
7. Tắt sidecar VieNeu → ứng dụng vẫn chạy, chỉ mất audio tiếng Việt.

## Kiểm tra

- **Trạng thái cập nhật 2026-09-01:**
  - [x] Type-check: `npm run type-check` PASS.
  - [ ] Unit test: đã có test Vitest trong `src/**`, chưa chạy trong lần xác thực này.
  - [ ] Lint: artifact hiện có 0 lỗi và 40 cảnh báo; chưa chạy trong lần xác thực này.
  - [ ] Build: chưa chạy trong lần xác thực này.
  - [ ] Production: cần xác minh Prisma migrations, biến môi trường, PostgreSQL và VieNeu sidecar trước khi deploy.

```bash
npm run type-check
npm test
npm run build
```
