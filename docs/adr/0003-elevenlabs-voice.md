# ADR 0003: Giọng AI ElevenLabs chọn lọc và voice ở mọi màn hình

**Trạng thái:** Chấp nhận 2026-09-18 (Plan15). Thay thế một phần ADR 0001 (chi phí bằng không) và ADR 0002 (không TTS server).

## Bối cảnh

Sau khi deploy Plan14, chủ sản phẩm phản hồi: voice chỉ có ở vài chỗ (đọc từ trong bài học); trò chơi và phần học giao tiếp không có gì để nghe; đồng thời yêu cầu research ElevenLabs và đưa các giọng được đánh giá cao vào repo. Khảo sát xác nhận: game Chọn nhanh/Ghép cặp không có nút nghe; Nghe & viết chỉ phát file sinh sẵn không tồn tại trên Vercel; bài AI riêng không đọc câu hỏi/đáp án ẩn; phiên Mission không tự đọc lượt mở đầu.

## Quyết định

1. **ElevenLabs là giọng chính, trình duyệt là fallback.** Server gọi `POST /v1/text-to-speech/{voice_id}` (`src/server/voice/elevenlabs.ts`), key chỉ ở server, base URL cố định trong code. Không key → mọi route audio 503, client tự dùng giọng trình duyệt (Plan14). Model: `eleven_multilingual_v2` (tiếng Anh), `eleven_flash_v2_5` (tiếng Việt; multilingual_v2 không hỗ trợ vi).
2. **Không hard-code voice ID; xếp hạng giọng của chính tài khoản.** ElevenLabs cho các giọng "Default" (Rachel, Sarah, George, Brian, Daniel…) hết hạn 31/12/2026 và chỉ tài khoản tạo trước 03/2026 mới có; bộ thay thế vĩnh viễn (Talia, Elara, Alicia, Finley, Lawrence, Eldrin, Caleb, Eddie, Wyatt, Darian…) khác tên và ID. `elevenlabs-voice-policy.ts` xếp hạng `GET /v2/voices` theo bảng tên ưu tiên (từ research reviewer 2026 + bộ thay thế chính thức), accent yêu cầu, nhãn tuổi/use-case/mô tả, loại giọng nhân vật/novelty. `npm run voice:doctor` in bảng thật; env `ELEVENLABS_VOICE_*` để ghim.
3. **Đáp án ẩn được đọc bằng route audio server-side** (`/api/game-runs/{run}/rounds/{round}/audio`, `/api/learner/personalized-lessons/{id}/exercises/{ex}/audio`): text đọc từ DB, chỉ trả bytes; FILL/CHOICE không bao giờ được đọc.
4. **Voice ở mọi màn hình:** quiz tự đọc từ + nút nghe; thẻ từ Ghép cặp có loa; Nghe & viết tự phát; bài riêng "Nghe câu hỏi"/"Nghe từ cần viết"; phiên mới tự đọc lượt mở đầu; bài học luôn có "Nghe"; flashcards qua pipeline curated.
5. Học viên chọn giọng trong danh sách đã chọn lọc và có thể tắt giọng AI (preferences localStorage).

## Phương án đã loại
| Phương án | Lý do |
|---|---|
| Hard-code ID Rachel/Sarah/George… | Sẽ 404 trên tài khoản mới và biến mất sau 31/12/2026. |
| `eleven_v3` mặc định | Độ trễ và giá cao hơn cho câu ngắn; giữ làm override. |
| Gọi ElevenLabs từ trình duyệt | Lộ key. |
| Streaming | Câu ≤ 600 ký tự, buffer đủ nhanh; streaming thêm phức tạp trên Vercel. |
| Ngân sách TTS theo user trong DB | Chưa có số đo sử dụng; tạm dùng cap/request + cache + usage alert của ElevenLabs. |

## Hệ quả
- Có chi phí vận hành theo ký tự khi bật key (cap 600/request, cache 2 tầng). Không key = hành vi Plan14.
- Chất lượng giọng thật chỉ kiểm được với key thật (OPERATIONS Plan15 §2); E2E chỉ kiểm đường degrade.
