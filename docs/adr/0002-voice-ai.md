# ADR 0002: Voice AI — giọng đọc chọn lọc, nói để trả lời, chấm phát âm trên server

**Trạng thái:** Chấp nhận 2026-09-18 (Plan14). Thay thế một phần ADR 0001 (mục "Thay thế" bên dưới).

## Bối cảnh

Sau Plan13, "giọng" trong ListenAI chỉ là nút nghe lại bằng giọng hệ thống: văn bản thô (markdown, emoji, IPA, tiếng Việt lẫn tiếng Anh) đi thẳng vào Web Speech; giọng bị ghim `en-GB` và xếp hạng theo chuỗi tên; không có đường nói vào; header `Permissions-Policy` chặn micro toàn app. Sidecar VieNeu chỉ chạy local. Nhà cung cấp AI duy nhất (Vyce) không có model audio (probe `GET /models` 2026-09-18). Yêu cầu của chủ sản phẩm: Voice AI phát âm chuẩn, đúng ngữ pháp, hợp với repo và chạy production trên Vercel.

## Quyết định

1. **Mọi chuỗi vào giọng đi qua `prepareSpokenText`** (`src/core/voice/spoken-text.ts`): sạch markdown/emoji/IPA/URL/stage direction, tách câu, viết hoa + dấu kết câu, mở rộng viết tắt/ký hiệu tiếng Anh, tách dòng theo ngôn ngữ (dấu tiếng Việt → vi). API: `speakCurated`, `speakLines`, `speakVoiceScript` trong `src/core/tts/speech.ts`.
2. **Server dựng kịch bản giọng cho lượt AI** (`buildTurnVoiceScript`, gắn `voiceScript` vào DTO): NPC tiếng Anh (0.95), RECAST = câu đã sửa đọc chậm (0.82, chỉ khi ≥ 2 từ và khác câu sai), COACH tiếng Việt (1.0). **Không bao giờ đọc câu sai của học viên.**
3. **Chính sách giọng** (`voice-policy.ts`): NEURAL > PREMIUM > SYSTEM > REMOTE(Google); giọng novelty bị loại; accent học viên chọn (mặc định `en-US`, có `en-GB`) luôn thắng tier.
4. **Nói vào bằng recogniser trình duyệt** (Chrome/Edge/Safari), audio không rời trình duyệt qua mã của ta; `Permissions-Policy: microphone=(self)`. Firefox giữ đường gõ.
5. **Chấm phát âm tất định trên server** (`POST /api/voice/pronunciation`): điểm mức từ từ transcript (đồng âm tính đúng), verdict GOOD/ALMOST/RETRY. Có `sessionId` thì câu phải thuộc `voiceScript` của phiên và điểm ghi vào sổ sự kiện phiên (`VOICE_PRACTICE`, %). Không ghi `LearningEvidence`/mastery.

## Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| TTS/STT server qua OpenAI/ElevenLabs/Azure | Tốn phí + cần key mới; Vyce (nhà cung cấp duy nhất theo quyết định 2026-09-17) không có model audio; ADR 0001 giữ chi phí vận hành bằng không. |
| Chạy VieNeu/Piper trên Vercel | Python sidecar + model ONNX không chạy trong Node serverless. |
| Dùng LLM "sửa câu trước khi đọc" | Thêm một lượt gọi provider mỗi lần bấm nghe; câu đọc khác câu hiển thị; độ trễ. Chuẩn ngữ pháp được bảo đảm bằng cách **chọn lọc nguồn** (chỉ đọc NPC/expected) thay vì sửa. |
| Ghi điểm phát âm thành bằng chứng kỹ năng | Điểm STT mức từ chưa được kiểm chứng; sẽ làm planner nhân quả tuyên bố sai. Để pilot quyết. |
| Tự gửi câu trả lời ngay sau khi nghe xong | Máy nghe sai → gửi nhầm; học viên bấm gửi để còn sửa. |

## Thay thế ADR 0001

- "Engine loại trừ Google voice" → Google là tier cuối, vẫn dùng khi là giọng tiếng Anh duy nhất (Android).
- "Tiếng Anh ghim en-GB" → tuỳ chọn accent của học viên, mặc định en-US.
- "quality fast/high đổi xếp hạng" → luôn chọn giọng tốt nhất theo chính sách.
- Đường tiếng Việt (VieNeu local + Web Speech fallback) **giữ nguyên**.

## Hệ quả

- Không biến môi trường mới, không migration, không phụ thuộc mới; chạy nguyên trên Vercel Node runtime.
- Chất lượng giọng vẫn phụ thuộc thiết bị; settings hiển thị giọng đang dùng và tier để giải thích.
- Nhận dạng giọng phụ thuộc trình duyệt và mạng (Chrome dùng dịch vụ của Google); điểm chỉ phản ánh **độ dễ hiểu ở mức từ**, không phải phoneme/accent.
