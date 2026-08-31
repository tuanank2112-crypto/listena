# ADR 0001: Kiến trúc giọng đọc (Text-to-Speech Engine)

**Trạng thái:** Đã cập nhật — kiến trúc hai đường dẫn (dual-path) cho tiếng Anh và tiếng Việt.

## Bối cảnh

ListenAI là ứng dụng tự học tiếng Anh A2 cho người Việt. Nội dung giảng dạy chủ yếu bằng tiếng Anh, nhưng gia sư AI (tutor) và chú giải từ vựng có thể sử dụng tiếng Việt. Do đó, hệ thống giọng đọc cần hỗ trợ cả hai ngôn ngữ với chất lượng tự nhiên, độ trễ thấp và chi phí vận hành bằng không.

## Các phương án đã xem xét

| Phương án | Đánh giá |
| --- | --- |
| **Web Speech API (voice hệ thống)** | Tích hợp sẵn trong trình duyệt/hệ điều hành, miễn phí và phát ngay lập tức. Chọn được Natural/Premium/Enhanced khi thiết bị có sẵn. **Được chọn cho tiếng Anh**. |
| **Kokoro-82M (kokoro-js)** | Mô hình TTS 82M tham số, giấy phép Apache 2.0. Chất lượng ổn nhưng phải tải ~80 MB lên trình duyệt trước khi phát, gây delay lớn. **Loại khỏi runtime client**. |
| **Piper TTS** | Chạy cục bộ, chất lượng tốt, nhưng cần pipeline riêng để phân phối model và không có gói npm sẵn sàng cho trình duyệt. |
| **VieNeu-TTS** | Mô hình TTS tiếng Việt thế hệ mới (v3 Turbo, 48 kHz), chạy on-device qua ONNX Runtime, không cần GPU. Hỗ trợ int8 backbone, voice cloning tức thì, và danh sách giọng đọc có sẵn. PyPI package `vieneu` phiên bản 3.3.0. **Được chọn cho tiếng Việt**. |
| **TTS trả phí (OpenAI, Google Cloud, v.v.)** | Chất lượng cao nhưng phát sinh chi phí, độ trễ mạng, và phụ thuộc vào kết nối Internet. Không phù hợp với mục tiêu offline và chi phí vận hành bằng không. |

## Quyết định

Kiến trúc hai đường dẫn (dual-path):

1. **Đường dẫn 1 — Tiếng Anh (nội dung giảng dạy):** Web Speech API với voice hệ thống miễn phí đã cài sẵn. Engine loại trừ Google voice và ưu tiên Natural → Premium/Enhanced → Microsoft/Apple → voice hệ thống khác. Không tải model lúc bấm phát; ưu tiên tuyệt đối là độ trễ thấp.

2. **Đường dẫn 2 — Tiếng Việt (tutor, chú giải, feedback):** Sidecar FastAPI chạy riêng với `Vieneu(mode="v3turbo", precision="int8")`. Mỗi worker uvicorn tải một bản sao của model vào RAM; chỉ chạy đúng 1 worker. Next.js gọi sidecar qua API route nội bộ `/api/tts/vie`, có xác thực bằng shared secret (`TTS_API_KEY`). Audio được cache trên đĩa và trả về với header `Cache-Control: immutable`. Nếu sidecar không khả dụng, ứng dụng không sập — chỉ mất audio tiếng Việt.

## Hệ quả

### Tích cực
- Phát âm tiếng Anh ngay lập tức, không chờ tải voice/model.
- Không dùng giọng trả phí và không dùng Google voice.
- Chi phí vận hành bằng không (cả hai engine đều chạy on-device hoặc local).
- Audio caching (IndexedDB cho Kokoro, đĩa cho VieNeu) giảm tải lặp lại.
- Kiến trúc module: mỗi engine cài được qua interface `SpeechEngine`.

### Tiêu cực
- Giọng tiếng Anh phụ thuộc voice hệ thống có sẵn trên từng thiết bị.
- Sidecar VieNeu yêu cầu Python + thư viện phụ thuộc (~1-2 GB RAM lúc runtime).
- Cold-start sidecar: model ONNX tải lần đầu ~10-30 giây (warm-up tự động lúc startup).
- Cần duy trì hai pipeline: npm (Kokoro) và pip (VieNeu).

### Ràng buộc
- KHÔNG dùng VieNeu để đọc nội dung tiếng Anh (sẽ dạy sai phát âm).
- KHÔNG hardcode danh sách giọng — truy vấn runtime từ thư viện.
- Cache key bao gồm engine version, voice, text, speed — thay đổi bất kỳ trường nào đều tạo cache mới.
- Không sửa đổi dataset, Prisma schema, scoring/SRS, hoặc retrieval logic.
- Nội dung Educaplay Đà Nẵng giữ DRAFT, không phát audio.
