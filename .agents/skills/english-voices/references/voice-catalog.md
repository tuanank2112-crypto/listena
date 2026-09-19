# Catalog giọng tiếng Anh miễn phí — bản đọc cho người

> **Nguồn chân lý là mã**: `src/core/voice/browser-voice-catalog.ts` và bảng trong
> `planning/18_2026-09-19_curated-browser-voices/specs/SPEC-P180-CATALOG.md` §4.
> File này chỉ giải thích *vì sao*; khi hai bên lệch nhau, mã và SPEC thắng.

## 1. Bốn nguồn giọng, không cái nào tốn tiền

| Nguồn | Có ở đâu | Cần mạng | Chất lượng |
|---|---|---|---|
| **Microsoft Natural** | Edge (bản "Online (Natural)") và Windows 11 (bản local cài thêm) | Online: có. Local: không | Cao nhất trong nhóm miễn phí |
| **Apple** | macOS/iOS, thấy qua Safari và Chrome trên máy đó | Không (sau khi tải) | Cao với bản Premium/Enhanced và giọng Siri |
| **Google** | Chrome trên desktop, Android | Có | Trung bình — rõ nhưng ít biểu cảm |
| **Microsoft SAPI đời cũ** | Mọi máy Windows (David, Zira, Mark, Hazel, George) | Không | Thấp — đây là thứ tạo cảm giác "giọng robot" |

## 2. Giọng nên dùng

**Giọng Mỹ (en-US):** Ava (96) → Emma (93) → Andrew (92) → Brian (90) → Siri (88) → Alex (86) / Jenny (86) → Christopher (84) / Nicky (84).
**Giọng Anh (en-GB):** Sonia (94) → Ryan (90) → Libby (86) / Serena (86) → Daniel (84) → Kate (82) / Arthur (80).

Số trong ngoặc là `listenability` — thang 0..99 do repo tự đặt cho học viên **A1–A2**, ưu tiên: rõ âm cuối, nhịp vừa, ít ngữ điệu kịch tính. Đây là **đánh giá chủ quan có chủ đích**, không phải số đo từ nhà cung cấp; nó chỉ quyết định thứ tự **trong cùng một tier** nên có lệch vài điểm cũng không phá vỡ gì.

## 3. Vì sao cần catalog

Chính sách Plan14 xếp hạng theo *tier* suy từ tên giọng. Trên một máy Windows + Edge, tier NEURAL có hơn mười giọng Microsoft Natural, và trước Plan18 thứ tự cuối cùng rơi vào **so sánh chữ cái** — "Andrew" đứng trước "Ava" chỉ vì chữ A-n < A-v. Catalog thay bước so chữ cái đó bằng đánh giá có chủ đích.

## 4. Vài mục cần biết lý do

- **Alex (86)** là giọng macOS cổ điển: nặng (vài trăm MB) nhưng ngắt nghỉ và lấy hơi như người thật, nên được xếp trên phần lớn giọng Apple khác.
- **Maisie (55)** và **Ana (50)** là giọng **trẻ em**. Điểm thấp là cố ý: không dùng làm mẫu phát âm cho người lớn, nhưng vẫn giữ trong danh sách để học viên tự chọn nếu muốn (Ana nằm trong tier NEURAL nên nếu không hạ điểm nó sẽ chen lên đầu).
- **Google (58–62)** ở tier REMOTE nên luôn xếp sau giọng local cùng accent, kể cả sau giọng SAPI cũ. Vẫn giữ vì trên nhiều máy Android đó là giọng tiếng Anh duy nhất (quyết định Plan14, không lật).
- **David/Zira/Mark/Hazel/George (30–34)** có trong catalog **để nhận diện**, không phải để khen: khi chúng đứng đầu danh sách, UI hiện gợi ý cài thêm giọng Natural.
- **Siri** gộp nhiều bí danh (`siri`, `siri 1`…`siri 5`) vì macOS/iOS đặt tên theo số.

## 5. Giọng chưa có trong catalog

Không sao — vẫn được xếp hạng bằng tier, chỉ là không có mô tả tiếng Việt và không được cộng điểm. Ví dụ `Microsoft Natasha Online (Natural) - English (Australia)`: giọng Úc, ngoài phạm vi en-US/en-GB, vẫn phát được khi máy không có giọng nào khác. Muốn thêm: theo công thức A trong `SKILL.md`.
