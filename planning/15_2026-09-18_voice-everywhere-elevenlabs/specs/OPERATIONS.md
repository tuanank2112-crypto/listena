# OPERATIONS — Plan15

## 1. Bật giọng AI (user)
1. Tạo API key tại ElevenLabs (quyền text-to-speech + voices read). Gói Free/Starter đủ để thử; lưu ý quota ký tự/tháng.
2. Local: thêm `ELEVENLABS_API_KEY=...` vào `.env` (không commit) → `npm run voice:doctor -- --probe` → xem bảng xếp hạng en-US / en-GB / vi và một probe audio. Nếu muốn ghim giọng: đặt `ELEVENLABS_VOICE_EN_US=<id>` (v.v.).
3. Vercel: Settings → Environment Variables → thêm `ELEVENLABS_API_KEY` (Production + Preview, kiểu Encrypted, **không** Sensitive vì cần đọc lúc runtime là đủ; Sensitive cũng chạy được vì chỉ đọc ở request) và các override tuỳ chọn → Redeploy.
4. Không cần đổi CSP (server gọi ElevenLabs), không migration.

## 2. Kiểm sau deploy
- Đăng nhập → `GET /api/voice/tts` trả `enabled:true` và danh sách giọng.
- Mission: vào phiên mới → nghe NPC mở đầu bằng giọng AI (settings hiện badge "Giọng AI đang bật").
- Games: Chọn nhanh tự đọc từ; Ghép cặp có loa trên thẻ từ; Nghe & viết tự phát từ ẩn.
- Bài riêng: "Nghe câu hỏi" / "Nghe từ cần viết".
- Settings: đổi accent en-GB → danh sách giọng đổi; nghe thử từng giọng; tắt "Dùng giọng AI" → về giọng trình duyệt ngay.

## 3. Chi phí & giới hạn
- 1 request ≤ 600 ký tự; cache server 48 mục/instance và client 40 mục/trang giảm lặp. Chưa có ngân sách theo user trong DB (vùng cấm tạm) → **đặt Usage alert trên ElevenLabs** và theo dõi `X-Voice-Cache` HIT rate qua log nếu cần.
- 429 → client tự chuyển giọng trình duyệt cho lượt đó; không retry bão.

## 4. Rollback
- Xoá `ELEVENLABS_API_KEY` trên Vercel → toàn bộ về giọng trình duyệt ngay (không cần deploy lại nếu biến được đọc mỗi request; nếu không, redeploy).
- Code: revert theo WP (tập file trong plan.md). Không có thay đổi DB.
