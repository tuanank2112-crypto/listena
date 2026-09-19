# SPEC-P183 — Trang "Giọng nói" ngoài màn hình Mission

Bổ sung 2026-09-19 sau khi demo local. Thuộc Plan18, không mở plan mới: cùng mục tiêu "học viên tự chọn giọng", chỉ thêm đường vào.

## 1. Vấn đề phát hiện khi demo

`VoiceSettings` chỉ được render trong `session-player.tsx`. Muốn đổi giọng, học viên **bắt buộc phải bắt đầu một Mission** (tốn một lượt gọi AI) rồi mới bấm được nút cài đặt. Giọng đó lại dùng ở mọi màn hình khác, nên chỗ đặt hiện tại sai với phạm vi ảnh hưởng của nó.

## 2. Contract

```
Route:  /learner/settings          (client component, không có API mới, không chạm DB)
File:   src/app/learner/settings/page.tsx
Guard:  kế thừa src/app/learner/layout.tsx (auth + role LEARNER|ADMIN) — KHÔNG tự viết guard mới
Nav:    learnerNav trong src/components/app-shell.tsx
        { href: "/learner/settings", label: "Giọng nói", icon: AudioLines }  — đặt sau "Tiến bộ"
```

Trang gồm: tiêu đề, một câu nói rõ giọng này dùng ở đâu, `<VoiceSettings />`, và khối "Nghe chưa hay?" (4 bước, rút từ `references/install-voices.md`).

## 3. Luật

| # | BẮT BUỘC / CẤM | Lý do |
|---|---|---|
| S1 | `VoiceSettings` vẫn **giữ nguyên** trong session player. Trang mới là đường vào **thêm**, không phải thay thế. | Đang học mà phải rời phiên để chỉnh giọng thì tệ hơn hiện tại. |
| S2 | **CẤM** thêm API, DB, hay state server cho trang này. Preference vẫn chỉ ở `localStorage`. | Bất biến A5/A7 (00-ARCHITECTURE). |
| S3 | **CẤM** tự viết auth guard trong page; layout của `/learner` đã guard. | Hai nguồn guard sẽ lệch nhau. |
| S4 | Thanh điều hướng di động phải giữ **đúng 2 hàng**. Learner nay có 8 mục + Đăng xuất = 9 ô ⇒ `grid-cols-5` (5+4). | 9 ô trên `grid-cols-4` sinh hàng thứ ba lẻ loi. |
| S5 | Trang **CẤM** tràn ngang ở bề rộng 360px. | Xem F-01 dưới. |

## 4. F-01 — lỗi tràn ngang do `<fieldset>` (đã sửa)

Đo trên Chromium 360px: `document.scrollWidth = 538` so với `clientWidth = 360` — tràn **178px**, thủ phạm đầu bảng là `<fieldset className="mt-4">` của khu chọn giọng.

Nguyên nhân: `<fieldset>` mặc định `min-inline-size: min-content`, nên tên giọng cộng nhãn nền tảng ("Christopher MICROSOFT NATURAL") ép cả trang rộng ra; `truncate` ở dòng mô tả vì thế cũng vô hiệu.

Sửa: thêm `min-w-0` cho **cả ba** `<fieldset>` trong `voice-settings.tsx` (khu giọng trình duyệt, khu giọng AI, khu Tốc độ) — hai khu kia cùng lỗi tiềm ẩn, chỉ chưa lộ vì nội dung ngắn hoặc đang rỗng khi không có key.

Sau sửa: `scrollWidth === clientWidth === 360`, nút loa hiện đủ, mô tả cắt gọn.

**Ghim bằng test:** ca E2E "the voice page lets a learner choose a voice without starting a Mission" đặt viewport 360px và khẳng định `scrollWidth <= clientWidth`.

## 5. Nghiệm thu

- Đăng nhập → bấm "Giọng nói" ở điều hướng → tới `/learner/settings`, thấy picker mà **không** cần bắt đầu Mission.
- Chọn một giọng → F5 → vẫn giữ.
- Ở 360px: không tràn ngang; điều hướng di động đúng 2 hàng.
- `next build` liệt kê route `/learner/settings`.
