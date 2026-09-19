# ADR 0004: Catalog giọng trình duyệt miễn phí và quyền chọn giọng của học viên

**Trạng thái:** Chấp nhận local 2026-09-19 (Plan18). Bổ sung ADR 0002 (chính sách giọng Plan14) và ADR 0003 (đường ElevenLabs có key); không thay thế cả hai.

## Bối cảnh

Chủ sản phẩm 2026-09-19: *"thêm các voice khác nghe thanh thoát hơn, dễ nghe hơn mà chuẩn tiếng anh hơn… tôi cần voices đó là các skills chứ k phải dùng api key của elevenlab"*. Hai điều kiện: giọng phải hay hơn **khi chưa có key ElevenLabs** (Plan16 WP2/WP4/WP5 vẫn mở vì không có key), và tri thức về giọng phải ở dạng **skill** như Plan17 đã làm với ElevenLabs.

Rà lại mã cho thấy hai lỗ hổng thật:

1. Chính sách Plan14 xếp hạng theo *tier* suy từ tên giọng. Trên máy Windows + Edge, tier NEURAL có hơn mười giọng Microsoft Natural, nên bước quyết định cuối cùng là **so sánh chữ cái**: "Andrew" thắng "Ava" chỉ vì thứ tự alphabet. Không ai từng thẩm định giọng thắng có dễ nghe hay không.
2. Học viên **không có cách nào đổi giọng trình duyệt**. Picker duy nhất trong Settings là cho giọng ElevenLabs, và nó rỗng khi không có key.

## Quyết định

1. **Catalog giọng đã thẩm định** (`src/core/voice/browser-voice-catalog.ts`): 47 giọng miễn phí của Microsoft Natural, Apple, Google và SAPI đời cũ, mỗi mục có điểm `listenability` (0..99) cho học viên A1–A2, nhãn và mô tả tiếng Việt. Khớp theo **tên đã chuẩn hoá**, không theo `voiceURI` (URI khác nhau giữa Chrome/Edge/Safari/Firefox).
2. **Điểm chỉ xếp thứ tự bên trong tier:** `quality = TIER_RANK × 100 + listenability`. Thứ tự Plan14 (accent → tier → default → local) còn nguyên; điểm catalog thay đúng bước "so chữ cái".
3. **Học viên tự chọn giọng và nghe thử**: preference `browserVoices` theo từng accent (localStorage), `WebSpeechEngine` đọc lúc phát nên đổi giọng ăn ngay không cần F5, mục "Tự động" luôn ở đầu để quay về chính sách.
4. **`speakWithBrowserVoice` là đường riêng cho nghe thử**: đi thẳng engine trình duyệt, bỏ qua engine AI. Nếu dùng `speakCurated`, máy có key sẽ trả lời nút "nghe thử giọng hệ thống" bằng giọng ElevenLabs.
5. **Đóng gói thành skill** `english-voices` (`.agents/skills/` canonical + shim `.claude/skills/` ≤10 dòng), gồm catalog dạng đọc cho người và hướng dẫn cài giọng theo từng hệ điều hành.

## Phương án đã loại

| Phương án | Lý do |
|---|---|
| Sidecar TTS offline (Piper/Kokoro) | Chất lượng đồng đều nhưng cần Python + model 100–300 MB và **không chạy trên Vercel** ⇒ production vẫn phải rơi về giọng trình duyệt. User chọn phương án chạy được ở mọi nơi. |
| Để điểm catalog vượt tier | Trên Android "Google US English" (có trong catalog) sẽ lật ngược giọng neural của máy — phá quyết định Plan14. |
| Lọc bỏ giọng ngoài catalog | Máy lạ sẽ câm. Catalog chỉ cộng điểm. |
| Loại giọng Google/REMOTE | Trên nhiều máy Android đó là giọng tiếng Anh duy nhất (quyết định Plan14, giữ nguyên). |
| Dùng chung `aiVoices` cho giọng trình duyệt | Sanitiser của `aiVoices` chỉ nhận ID ElevenLabs `[A-Za-z0-9]{8,64}`, sẽ nuốt sạch `voiceURI` có dấu cách. |
| Tự cài giọng hộ người dùng | Không thể và không nên: đó là thao tác cấp hệ điều hành. Repo chỉ hướng dẫn. |
| Ghi lựa chọn giọng lên server / vào hồ sơ học | Vùng cấm Plan14/15: nghe không sinh bằng chứng học tập. |

## Hệ quả

- Chi phí vẫn bằng 0 và chạy được trên production Vercel; đường ElevenLabs không đổi (có key thì giọng AI vẫn dẫn đầu).
- Điểm `listenability` là **đánh giá chủ quan có chủ đích** của repo, không phải số đo của nhà cung cấp. Nó chỉ tác động trong một tier nên sai vài điểm không phá bất biến nào; đổi điểm phải sửa bảng SPEC-P180 §4 trước.
- Máy chỉ có giọng SAPI đời cũ vẫn nghe dở — catalog không tạo ra giọng mới. Đường xử lý là gợi ý cài giọng hiện trong UI khi không có giọng NEURAL nào, cộng với skill.
- Giọng "Online (Natural)" của Edge cần Internet; mất mạng thì Edge tự rơi về giọng local và bảng xếp hạng vẫn hợp lệ.
