# ADR 0001: Kiến trúc giọng đọc

## Bối cảnh

ListenAI dạy phát âm tiếng Anh, nên giọng đọc phải nhất quán giữa flashcard, trò chơi và bài học. Web Speech API phụ thuộc hệ điều hành và trình duyệt, do đó không đủ độ lặp lại cho mục tiêu sư phạm.

## Phương án

| Phương án | Đánh giá |
| --- | --- |
| Web Speech API | Nhanh nhưng không nhất quán; chỉ giữ làm fallback cuối. |
| Kokoro-82M | Chạy cục bộ, bản q8 phù hợp cache trình duyệt; được chọn cho tiếng Anh. |
| Piper | Cục bộ nhưng cần phân phối model và pipeline riêng. |
| VieNeu | Phù hợp tiếng Việt, nhưng UI hiện chưa có consumer nên hoãn. |
| TTS trả phí | Chất lượng tốt nhưng có chi phí, độ trễ và chuyển dữ liệu ra ngoài. |

## Quyết định

Dùng kokoro-js 1.2.1 với onnx-community/Kokoro-82M-v1.0-ONNX, dtype q8 và device wasm trong Web Worker. Voice mặc định lấy từ NEXT_PUBLIC_KOKORO_DEFAULT_VOICE; cấu hình mẫu và prebuild đều dùng bf_emma. Danh sách voice được đọc ở runtime từ list_voices() và voices, không hardcode.

## Hệ quả

Lần tải đầu tải model đáng kể; tiến độ được công bố qua trạng thái TTS. Audio runtime cache trong IndexedDB bằng SHA-256 của text chuẩn hóa, voice đã phân giải, phiên bản engine và speed. Tên cache không có plaintext. Kết quả cancelled là chủ đích và không kích hoạt fallback.
