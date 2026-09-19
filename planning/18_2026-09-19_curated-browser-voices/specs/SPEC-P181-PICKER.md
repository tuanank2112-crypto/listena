# SPEC-P181 — Học viên tự chọn giọng trình duyệt + nghe thử

## 1. Hiện trạng

`voice-settings.tsx` có `AiVoicePicker` cho giọng ElevenLabs (rỗng khi không có key) và chỉ **mô tả** giọng trình duyệt đang dùng bằng một dòng chữ (`describeEnglishVoice`). Học viên không có cách nào đổi giọng.

## 2. Preference

Theo [01-CONTRACTS.md §3](01-CONTRACTS.md). Bổ sung:

- Trường mới `browserVoices: Partial<Record<EnglishAccent, string>>`; lưu **`voiceURI`** (bền hơn `name` khi có hai giọng trùng tên khác locale). So khớp lúc phát chấp nhận cả `name` lẫn `voiceURI` (một số trình duyệt đổi `voiceURI` giữa các phiên bản).
- **CẤM** dùng chung `aiVoices` cho giọng trình duyệt: `aiVoices` sanitize bằng `/^[A-Za-z0-9]{8,64}$/` (ID ElevenLabs) sẽ loại sạch mọi `voiceURI` có dấu cách/dấu ngoặc.
- Đổi accent **không** xoá lựa chọn của accent kia: học viên bật/tắt Anh-Mỹ/Anh-Anh vẫn giữ giọng đã ghim cho mỗi bên.

## 3. Engine

`WebSpeechEngine` nhận `getPreferredVoiceURI` ([01-CONTRACTS.md §5](01-CONTRACTS.md)). `providers.tsx` truyền:

```ts
const getPreferredVoiceURI = (accent: EnglishAccent) => getVoicePreferences().browserVoices[accent];
const english = new WebSpeechEngine({ getAccent, getPreferredVoiceURI });
```

**BẮT BUỘC:** chỉ engine tiếng Anh nhận hàm này. `vietnameseFallback` giữ nguyên (vùng cấm D4).

**BẮT BUỘC:** `voiceCache` khoá theo `${lang}:${options.voice ?? ""}:${preferredURI ?? ""}`.

## 4. Nghe thử

`speakWithBrowserVoice` ([01-CONTRACTS.md §4](01-CONTRACTS.md)) là **đường duy nhất** để nút nghe thử phát giọng trình duyệt.

- **CẤM** dùng `speakCurated` cho nút này: khi server có key, `speakCurated` sẽ phát bằng ElevenLabs và học viên nghe nhầm giọng (bất biến A6).
- Câu mẫu tiếng Anh dùng lại hằng `SAMPLE_LINE` sẵn có. Văn bản vẫn phải sạch (đây là hằng, không phải nội dung học viên) — không cần `prepareSpokenText`.
- Tốc độ nghe thử dùng `preferences.rate` để học viên nghe đúng thứ mình sẽ nghe khi học.

## 5. UI

Khu vực mới trong `VoiceSettings`, đặt **ngay dưới** ô chọn accent và **trên** khu giọng AI:

```
Giọng tiếng Anh trên thiết bị này
[ Tự động (tốt nhất trên máy này) ]            ← mặc định, luôn ở đầu
[ Ava · Microsoft Natural · giọng nữ Mỹ… ] [▶]
[ Emma · … ]                                   [▶]
…tối đa 6 mục…
Máy bạn chỉ có giọng hệ thống cũ? Xem cách cài thêm giọng Natural miễn phí. (OPERATIONS §1)
```

Luật hiển thị:

| # | BẮT BUỘC / CẤM | Lý do |
|---|---|---|
| U1 | Danh sách lấy từ `rankEnglishVoices(window.speechSynthesis.getVoices(), accent)`, cắt còn **6** mục. | Dài hơn thì học viên không đọc, và giọng thứ 7 trở đi chắc chắn kém hơn. |
| U2 | Mục có trong catalog hiện `label` + `note` tiếng Việt; mục ngoài catalog hiện `voice.name` + nhãn tier sẵn có (`TIER_LABELS`). | Không giấu giọng lạ, cũng không bịa mô tả cho nó. |
| U3 | "Tự động" luôn là mục đầu và là giá trị khi `browserVoices[accent]` rỗng; chọn lại "Tự động" ⇒ `setPreferredBrowserVoice(accent, undefined)`. | Đường quay về mặc định phải luôn có. |
| U4 | `getVoices()` rỗng ⇒ hiện dòng chờ, KHÔNG hiện "không có giọng". Phải đăng ký `voiceschanged` (đã có `subscribeVoicesChanged`). | Chrome nạp giọng bất đồng bộ. |
| U5 | Giọng đã ghim không còn trong danh sách ⇒ hiện cảnh báo một dòng và đánh dấu "Tự động" đang hoạt động; **CẤM** tự xoá preference. | Máy có thể tạm thiếu giọng (Edge offline). |
| U6 | Nút nghe thử phải có `aria-label` dạng `Nghe thử <tên giọng>`; mục đang chọn dùng `aria-pressed`. | Đồng bộ với `AiVoicePicker` sẵn có. |
| U7 | **CẤM** gọi API/`fetch` trong khu vực này. | Client-only, chạy được cả khi mất mạng với giọng local. |

## 6. Nghiệm thu

- Chọn một giọng khác "Tự động" ⇒ bấm **Nghe** ở màn hình bài học phát **đúng giọng đó** ngay, không cần tải lại trang (bằng chứng: cache key có `preferredURI`).
- Tải lại trang ⇒ lựa chọn còn nguyên (localStorage).
- Đổi accent en-US ↔ en-GB ⇒ mỗi bên giữ giọng riêng.
- Có key ElevenLabs và `engine=auto` ⇒ nút **Nghe** vẫn phát giọng AI (plan này không cướp đường), nhưng nút **nghe thử** trong khu giọng trình duyệt vẫn phát giọng trình duyệt.
