# Kế hoạch 21 — Lỗi hay lặp: đếm đúng, gọi đúng tên, và cho học viên nhìn thấy

## Metadata Header

| Trường | Giá trị |
|---|---|
| Mã kế hoạch | 21_2026-09-19_recurring-mistakes |
| Loại | MINOR (SemVer) — đủ bộ SPEC theo luật §2 |
| Phiên bản dự án | 0.7.0 (bump là quyết định của user) |
| Ngày mở | 2026-09-19 |
| Trạng thái | LOCAL ACCEPTED — 5/5 gate xanh |
| Nguồn yêu cầu | User: "tôi cần sự sáng tạo của bạn trong repo này" (2026-09-19) |
| Phạm vi | Phân loại lỗi, cách đếm của planner, một đường đọc mới, một khu giao diện. **Không đổi schema.** |

## Bảng trỏ SPEC

| File | Nội dung |
|---|---|
| [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) | Hai lỗi thật + một khoảng trống, non-goals, 7 bất biến |
| [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) | Chữ ký hàm, endpoint, bảng lỗi + hành vi caller |
| [`specs/SPEC-P211-error-taxonomy.md`](specs/SPEC-P211-error-taxonomy.md) | 18 họ lỗi, phép khớp, xử lý lỗi lạ |
| [`specs/SPEC-P212-planner-counting.md`](specs/SPEC-P212-planner-counting.md) | Chuẩn hoá lúc ghi và lúc đọc |
| [`specs/SPEC-P213-mistakes-api.md`](specs/SPEC-P213-mistakes-api.md) | `GET /api/learner/mistakes` |
| [`specs/SPEC-P214-mistakes-panel.md`](specs/SPEC-P214-mistakes-panel.md) | Khu "Lỗi hay lặp" trên trang Tiến bộ |
| [`specs/OPERATIONS.md`](specs/OPERATIONS.md) | Triển khai, rollback từng phần |
| [`specs/TESTING-ACCEPTANCE.md`](specs/TESTING-ACCEPTANCE.md) | 26 ca test + bằng chứng khác biệt thật |

## Nhật ký quyết định

### 2026-09-19 23:58 — Tìm việc bằng cách đọc mã, không bằng cách nghĩ ra tính năng

User cho tự do chọn. Thay vì đề xuất một tính năng nghe hay, rà đường dữ liệu của chính thứ vừa chứng minh chạy thật trên production vài giờ trước: `detectedError`.

Lần theo từ `TutorTurnOutputSchema` → `service.ts` → `updateErrors` → `planner.ts` thì lộ ra **hai lỗi sai và một khoảng trống**, chi tiết ở [`00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md):

- **Lỗi A:** `detectedError.type` tự do + gộp bằng so sánh chuỗi chính xác ⇒ số đếm bị chẻ ⇒ planner **im lặng bỏ qua** học viên lặp lại lỗi dưới hai cái tên. Không có gì đổ vỡ; việc dạy đơn giản là không xảy ra.
- **Lỗi B:** `formatErrorType` (tồn tại **hai bản sao**) ghép kiểu lỗi thô vào câu tiếng Việt ⇒ *"Bạn đã lặp lại lỗi **tense** 4 lần"* cho người học A1-A2 không biết thuật ngữ tiếng Anh.
- **Khoảng trống C:** lời sửa của Coach chỉ sống một màn hình rồi không ai xem lại được.

Chuỗi `"tense"` không phải giả định — đó đúng là thứ Vyce trả về trên production lúc 23:45 cùng ngày.

### 2026-09-20 00:20 — Chuẩn hoá ở tầng đếm, không ràng buộc schema

Cách hiển nhiên là biến `detectedError.type` thành enum. **Đã loại.** Ép model vào một tập cứng làm mất sắc thái, và lỗi ngoài tập sẽ bị dồn về `UNKNOWN` — mất thông tin ngay tại nguồn.

Chọn: model cứ mô tả tự do, hệ thống chuẩn hoá **ở tầng đếm**. Được cả hai. Và vì chuẩn hoá **lũy đẳng** nên áp cả lúc đọc, tức là dữ liệu ghi trước hôm nay cũng gộp đúng — **không cần migration**, hợp ràng buộc "không được thay đổi db".

### 2026-09-20 00:35 — Lỗi lạ giữ riêng, dù nghe có vẻ bừa

Cám dỗ: dồn mọi kiểu lỗi không nhận ra vào một thùng `"other"`. **Đã loại, và đây là vùng cấm.**

Gộp hai lỗi lạ **khác nhau** sẽ cộng dồn số đếm và có thể đẩy tổng qua ngưỡng 3, khiến planner gửi học viên đi luyện một lỗi họ **chưa từng lặp lại**. Đếm chẻ làm mất một lần nhắc; đếm bịa dạy sai. Chọn cái rẻ hơn. Kiểu lạ giữ slug của chính nó, nhãn hiển thị vẫn là tiếng Việt "Lỗi khác".

### 2026-09-20 00:50 — Ngưỡng 6 ký tự cho khớp tiền tố

Khớp tiền tố tự do thì `intense` thành lỗi thì và `extraction` thành lỗi thừa từ. Khớp chính xác hoàn toàn thì `phonological` không tới được `phonolog` và `tenses` không tới được `tense`.

Chọn: khớp token chính xác, **cộng** bỏ `s` cuối, **cộng** khớp tiền tố chỉ với gốc từ dài ≥ 6. Cả hai ca hỏng ở trên đã ghim bằng test (T211-05).

### 2026-09-20 01:05 — Khu "Lỗi hay lặp" đặt ở Tiến bộ, và im lặng khi rỗng

Không đặt cùng trang "Từ yếu" (trang đó nói về **từ**, khu này nói về **cách nói** — trộn vào thì nhãn điều hướng nói dối). Không thêm mục điều hướng thứ 10.

Trang Tiến bộ có thanh kỹ năng nhưng **không có gì** giải thích vì sao một thanh thấp. Khu này nằm ngay dưới phần Kỹ năng, ngay trên phần Gần đây.

**Quyết định có cân nhắc:** lỗi tải hoặc không có dữ liệu ⇒ **biến mất hoàn toàn**, không hộp lỗi. Trang Tiến bộ vẫn trọn vẹn khi thiếu khu này; một hộp báo lỗi ở đây chỉ làm học viên lo về thứ không phải việc của họ. Đây **không phải** quên xử lý lỗi.

### 2026-09-20 01:15 — Khu này câm, và cố ý câm

Plan14 có vùng cấm: **không bao giờ đọc to câu sai của học viên**. Cả khu này làm bằng câu sai của họ, nên nó không có một nút nghe nào — dù mọi màn hình khác trong app đều có. Ghi rõ ở [`SPEC-P214`](specs/SPEC-P214-mistakes-panel.md) để người sau đừng "bổ sung cho nhất quán".

## Work Packages

| WP | Nội dung | Trạng thái |
|---|---|---|
| WP1 | `error-taxonomy.ts` — 18 họ lỗi + 14 unit test | ✅ |
| WP2 | Chuẩn hoá lúc ghi trong `service.ts` | ✅ |
| WP3 | Gộp trước ngưỡng + nhãn tiếng Việt ở `planner.ts` và `next-action.ts`; xoá 2 bản sao `formatErrorType` | ✅ |
| WP4 | `mistakes.ts` + 7 unit test | ✅ |
| WP5 | `GET /api/learner/mistakes` + 5 unit test | ✅ |
| WP6 | Khu "Lỗi hay lặp" trên trang Tiến bộ | ✅ |
| WP7 | 3 ca E2E | ✅ |
| WP8 | Bộ SPEC + đồng bộ não | ✅ |
| WP9 | Deploy production + nghiệm thu | ✅ |

## Checklist thực thi

- [x] Lần theo đường dữ liệu `detectedError` để tìm lỗi thật thay vì nghĩ ra tính năng
- [x] Hàm thuần, lũy đẳng, không đọc DB
- [x] Gộp **trước** khi lọc ngưỡng (thứ tự ngược lại sẽ giữ nguyên lỗi cũ)
- [x] Test chứng minh ca 2+2 nay chạm ngưỡng
- [x] Test khẳng định câu tiếng Việt **không** chứa chuỗi tiếng Anh
- [x] E2E chứng minh câu sai của học viên khác không rò ra
- [x] Không migration, không env mới, không dependency mới
- [x] Deploy production và nghiệm thu (`listena-6fesmywcp`, commit `fd0dade`)

## Exit Gates

| Gate | Kết quả | Môi trường |
|---|---|---|
| `npm run type-check` | 0 lỗi | ✅ local / ⬜ server |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | ✅ local / ⬜ server |
| `npx vitest run` | **134 file / 868 test** (trước 131/840) | ✅ local / ⬜ server |
| `npm run build` | PASS, có `/api/learner/mistakes` | ✅ local / ⬜ server |
| `npx playwright test` | **46/46** (trước 43/43) | ✅ local / ⬜ server |
| Nghiệm thu production | `/learner/progress` **307** về login; `/api/learner/mistakes` ẩn danh **401**; và với học viên thật: **200** trả đúng một họ `tense` gắn nhãn **"Thì của động từ"** | ✅ **server** |

### 2026-09-20 01:45 — Deploy và nghiệm thu bằng dữ liệu thật trên production

Deploy `https://listena-6fesmywcp-n-listen-ai.vercel.app` READY, alias `https://listena.vercel.app`.

Không dừng ở mã trạng thái. Đăng nhập bằng học viên thật và gọi `/api/learner/mistakes`:

```json
{ "families": [ {
    "key": "tense",
    "labelVi": "Thì của động từ",
    "count": 1,
    "examples": [ {
      "actual": "lose",
      "explanationVi": "Với 'Yesterday' cần dùng quá khứ đơn: 'I lost my suitcase'.",
      "sessionGoal": "Báo thất lạc hành lý và mô tả chiếc vali đủ rõ để nhân viên tìm thấy."
    } ] } ],
  "correctedTurnCount": 1 }
```

Đây là **vòng khép kín trên hạ tầng thật**: một giờ trước Vyce chấm câu cài lỗi cố ý và trả `detectedError.type = "tense"`; nay chính lời sửa đó quay lại với học viên dưới nhãn tiếng Việt **"Thì của động từ"**, kèm từ họ viết sai và câu Coach đã giải thích. Chuỗi `"tense"` đi qua đúng đường chuẩn hoá mà SPEC-P211 mô tả.

| Kiểm | Kết quả |
|---|---|
| `GET /` | `200` |
| `GET /learner/progress` (chưa đăng nhập) | `307` về `/login?callbackUrl=%2Flearner%2Fprogress` |
| `GET /api/learner/mistakes` (ẩn danh) | `401` |
| `GET /api/learner/mistakes` (học viên thật) | `200`, một họ lỗi gắn nhãn tiếng Việt |

## Việc còn mở

- Theo dõi `rawTypes` sau một thời gian để biết model thực sự đặt tên lỗi thế nào, rồi bổ sung từ khoá cho các họ còn thiếu.
- Vocab Master: vòng học 5 bước và combo do máy chủ tính vẫn chờ user duyệt migration.
