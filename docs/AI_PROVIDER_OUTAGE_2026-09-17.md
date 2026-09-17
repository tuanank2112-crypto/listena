# Sự cố "Gia sư AI hiện chưa sẵn sàng" — chẩn đoán và khắc phục (2026-09-17)

- **Triệu chứng người dùng:** bấm "Học cùng AI" luôn nhận `Gia sư AI hiện chưa sẵn sàng. Vui lòng thử lại sau.`
- **Phạm vi:** toàn bộ tính năng AI (Mission, Lesson Coach, Daily Quest, bài học cá nhân hóa). Đây là lõi sản phẩm AI-native.
- **Trạng thái:** ĐÃ KHẮC PHỤC ở local và đã chứng minh bằng hội thoại thật. Cấu hình hosted chưa đụng tới.
- **Người chẩn đoán:** root, phiên 2026-09-17.

---

## 1. Nguyên nhân gốc

`KIRAAI_MODEL` trỏ tới một model **không tồn tại** trong danh mục nhà cung cấp.

| Nơi khai báo | Giá trị trước | Có trong danh mục? |
|---|---|---|
| `.env` (máy người dùng) | `qwen3.8-flash-free` | Không |
| `.env.example` (tracked) | `glm-5.3-flash-free` | Không |
| Danh mục thật | `qwen3.8-flash`, `glm-5.3-flash` (đều trả phí) | Có, nhưng khác tên |

Bằng chứng trực tiếp từ nhà cung cấp:

```text
POST https://kiraai.vn/api/v1/chat/completions  model=qwen3.8-flash-free
-> HTTP 404
{"error":{"message":"Model 'qwen3.8-flash-free' is not supported or not configured
  on the system.","type":"invalid_request_error","code":"model_not_found"}}

POST https://kiraai.vn/api/v1/chat/completions  model=ling-3.0-flash-free
-> HTTP 200  {"choices":[{"message":{"role":"assistant","content":"OK"}}]}
```

Những thứ **không** phải nguyên nhân, đã loại trừ bằng đo đạc:

- API key hợp lệ: `GET /api/v1/models` trả **HTTP 200** với 46 model.
- Base URL đúng: app gọi `https://kiraai.vn/api/v1/chat/completions`, khớp tài liệu.
- Code provider đúng: chỉ gửi `model`, `messages`, `max_tokens`, không dùng tham số lạ.

## 2. Danh mục model tại thời điểm chẩn đoán

46 model, trong đó chỉ **4 model miễn phí** và chỉ **1 model vừa miễn phí vừa `active`**:

| Model | Miễn phí | Trạng thái |
|---|---|---|
| `ling-3.0-flash-free` | có | **active** |
| `kira-mini-1.0` | có | maintenance |
| `deepseek-v4-flash-free` | có | maintenance |
| `minimax-m3-free` | có | maintenance |

42 model còn lại đều trả phí (`kira-3.5-pro`, `glm-5.3-flash`, `deepseek-v4-pro`, `grok-4.6`, `qwen3.8-flash`, …).

## 3. Khắc phục đã áp dụng

1. `.env` trên máy: `KIRAAI_MODEL=ling-3.0-flash-free`.
2. `.env.example` (tracked): sửa model không tồn tại, thêm chú thích cảnh báo và lệnh `curl /models` để kiểm tra trước khi đổi.

## 4. Bằng chứng đã khắc phục — hội thoại thật, không phải test

```text
POST /api/learning-sessions -> HTTP 201
kira ling-3.0-flash-free status=stop latencyMs=1606 requestId=chatcmpl-5d35bd76...

POST /api/learning-sessions/<id>/turns -> HTTP 201
turnCount=1 successfulTurns=1 trust=45 evidence=5
```

Nội dung thật của vòng học:

| Lượt | Nội dung |
|---|---|
| AI mở | "Hello. I can help with your missing luggage. What does your suitcase look like?" (`ASK_GUIDING`) |
| Học viên | "Hello, I lost my suitcase. It is big and blue." |
| AI coach | npcReply: "Thank you. Can you tell me the flight number and date?" · coachMessage: "Hãy dùng thì quá khứ để mô tả kích thước và màu sắc." · score 0.8 · confidence 0.9 · detectedError: grammar, "It is big and blue." nên dùng thì quá khứ |

Đúng vòng AI-native: nhiệm vụ ngữ cảnh → câu trả lời → coaching tiếng Việt → phát hiện lỗi → bước tiếp.

## 5. Vấn đề còn lại (chưa sửa, cần quyết định)

### 5.1 — P1 sản phẩm: một lỗi cấu hình vĩnh viễn bị trình bày như sự cố tạm thời

`model_not_found` (404, sai cấu hình, không bao giờ tự khỏi) và `503/429` (quá tải, thử lại là được) đều đổ về cùng một thông báo `Gia sư AI hiện chưa sẵn sàng. Vui lòng thử lại sau.`

Hệ quả: người dùng thử lại vô hạn, còn người vận hành không biết là mình cấu hình sai. Lỗi này đã tồn tại xuyên suốt nhiều plan mà không ai phát hiện, vì mọi test đều dùng provider tất định nên không bao giờ chạm danh mục model thật.

**Đề xuất:** phân biệt `invalid_config` với `temporarily_unavailable`; kiểm tra model tồn tại khi khởi động hoặc khi đọc cấu hình; ghi log kèm thân phản hồi lỗi của nhà cung cấp, hiện chỉ log mã trạng thái.

### 5.2 — P2: gói miễn phí giới hạn tần suất gắt

Đo trực tiếp trên `ling-3.0-flash-free`: 3 lần gọi nhỏ liên tiếp cho `429`, `200`, `200`. Trong app, một lần `429` hoặc `503` làm hỏng nguyên thao tác của người học và ghi một dòng `UNKNOWN` vào sổ `LearningSessionStartRequest`.

Provider có nhận diện `429` và trả `retryAfterSeconds`, nhưng **không tự thử lại**. Với sản phẩm thật nên dùng model trả phí; nếu giữ bản miễn phí thì cần thử lại có giới hạn ở tầng server cho `429/503`.

### 5.3 — P3: sổ ghi phiên tích lũy dòng UNKNOWN

Mỗi lần AI hỏng để lại một dòng `status=UNKNOWN`. Không có đường phục hồi trong giao diện, người học chỉ thấy lỗi. Cần cơ chế dọn hoặc hòa giải.

## 6. Bẫy môi trường phát hiện trong lúc chẩn đoán

Chạy `npm run build` **trong khi** `next dev` đang chạy làm hỏng thư mục `.next` dùng chung: các route API lồng nhau như `/api/learning-sessions/[sessionId]/turns` bắt đầu trả **404 HTML** dù file tồn tại và route cha vẫn 200. Khắc phục: dừng dev, `rm -rf .next`, chạy lại dev. Đừng build khi dev đang chạy.

## 7. Việc cần người dùng quyết

1. **Chọn model cho thật.** Bản miễn phí đủ để chứng minh vòng học chạy, nhưng bị giới hạn tần suất nên không dùng cho pilot được. Cần chốt model trả phí và hạn mức chi.
2. **Cấu hình hosted.** `.env` chỉ là máy local. Preview và Production trên Vercel vẫn mang giá trị model cũ nếu chưa sửa, nên sẽ hỏng y hệt.
3. **Có sửa mục 5.1 không.** Đây là lỗi làm cả đội mất nhiều ngày mà không thấy; nên sửa trước khi có người học thật.
