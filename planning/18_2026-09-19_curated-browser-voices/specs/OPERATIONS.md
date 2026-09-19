# OPERATIONS — cài giọng, triển khai, rollback

## 1. Cài thêm giọng miễn phí (việc của người dùng cuối, không phải của app)

### 1.1 Windows 11 — giọng Natural **local** (chạy cả khi offline, dùng được ở mọi trình duyệt)
`Settings → Accessibility → Narrator → Add natural voices → Add` → chọn `Microsoft Ava`, `Andrew`, `Emma`, `Brian` (en-US) và/hoặc `Sonia`, `Ryan` (en-GB) → tải (~100–200 MB mỗi giọng).
Kiểm: mở app → Settings giọng → phải thấy `Ava`, `Emma`… trong danh sách.

### 1.2 Microsoft Edge — giọng "Online (Natural)" (không cần cài, cần mạng)
Mở app bằng Edge là có ngay hàng chục giọng `Microsoft … Online (Natural)`. Đây là đường **rẻ nhất** để nghe hay: không cài gì, không key.

### 1.3 macOS / iOS
`System Settings → Accessibility → Spoken Content → System Voice → Manage Voices…` → English → tải bản **Premium** (Ava, Zoe, Allison, Serena, Daniel). Safari/Chrome trên máy đó sẽ thấy giọng mới.

### 1.4 Android
Cài/cập nhật **Speech Recognition & Synthesis by Google**, rồi `Settings → System → Languages → Text-to-speech output → Install voice data → English`.

### 1.5 Linux
Không có giọng neural miễn phí sẵn. Dùng Chrome/Edge để có giọng Google/Online, hoặc chấp nhận `espeak-ng` (chất lượng thấp).

> Ghi chú cho agent: app **không** cài giọng hộ người dùng và **không** được yêu cầu quyền gì thêm. Mọi hướng dẫn trên chỉ là nội dung hiển thị/skill.

## 2. Triển khai

Đợt này **không có** biến môi trường mới, **không có** migration, **không có** route mới. Thứ tự:

1. 5 gate local xanh (TESTING-ACCEPTANCE).
2. Commit trên nhánh `codex/vercel-turso-migration` (chờ user cho phép — WP8).
3. Push → CI xanh → deploy Vercel như thường lệ.
4. Smoke sau deploy (bắt buộc, trên Edge **và** Chrome):
   - `/settings` (hoặc nơi đặt `VoiceSettings`): thấy khu "Giọng tiếng Anh trên thiết bị này", ≥1 mục ngoài "Tự động".
   - Bấm ▶ ở một mục ⇒ nghe đúng giọng đó.
   - Chọn giọng đó ⇒ vào một bài học, bấm **Nghe** ⇒ đúng giọng vừa chọn.
   - F5 ⇒ lựa chọn còn nguyên.
   - `GET /api/voice/tts` vẫn trả `enabled:false` (chưa có key) và app **không** câm.

## 3. Rollback

Toàn bộ thay đổi là client-side, không trạng thái server ⇒ rollback = revert commit + redeploy. Không cần đụng DB.

Nếu chỉ muốn tắt tính năng mà không revert: xoá khu vực picker trong `voice-settings.tsx`; preference thừa trong `localStorage` được `sanitize` bỏ qua vô hại. **CẤM** đổi khoá `listena.voice.v1` (sẽ reset mọi preference của học viên đang dùng).

## 4. Rủi ro đã lường

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Máy user chỉ có giọng SAPI cũ ⇒ vẫn nghe dở | Cao | Catalog không tạo ra giọng mới; đường xử lý là dòng gợi ý cài (§1) trong UI + skill |
| Giọng "Online (Natural)" cần mạng | Trung bình | Chính sách vẫn xếp hạng giọng local; mất mạng thì Edge tự rơi về local |
| Học viên chọn giọng lạ rồi quên | Thấp | Mục "Tự động" luôn ở đầu; cảnh báo U5 khi giọng biến mất |
| Điểm listenability là **đánh giá chủ quan** | Trung bình | Ghi rõ trong SPEC-P180 và skill; chỉ tác động **trong** tier; đổi điểm không phá bất biến nào |
