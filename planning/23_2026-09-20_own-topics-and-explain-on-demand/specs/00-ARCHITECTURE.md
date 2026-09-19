# 00 — Kiến trúc và bất biến

## Thứ tự đọc

1. File này.
2. [`01-CONTRACTS.md`](01-CONTRACTS.md).
3. [`SPEC-P231-explain-on-demand.md`](SPEC-P231-explain-on-demand.md) — phần nhỏ, làm trước.
4. [`SPEC-P232-scenario-authoring.md`](SPEC-P232-scenario-authoring.md) — lõi sinh chủ đề.
5. [`SPEC-P233-scenario-routes.md`](SPEC-P233-scenario-routes.md) và [`SPEC-P234-my-scenarios-ui.md`](SPEC-P234-my-scenarios-ui.md).
6. [`OPERATIONS.md`](OPERATIONS.md), [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md).

## Nguyên tắc nền

User: *"tôi không muốn nó bị truyền thống hoá khi có sự kết hợp của AI."*

Hai thiếu sót họ nêu là **cùng một lỗi**: sản phẩm đang **quyết thay** học viên.

- Nó quyết họ chỉ được tập **ba** tình huống, cố định trong mã.
- Nó quyết họ **cần nghe** lời giải thích tiếng Việt sau mỗi lượt.

Một ứng dụng học truyền thống làm đúng hai việc đó. Kế hoạch này trả cả hai quyết định về cho học viên — và dùng AI để làm được điều mà một danh sách cứng không làm được.

## Non-goals (đã cân nhắc và quyết định KHÔNG làm)

| Không làm | Lý do |
|---|---|
| Màn CRUD chủ đề (nhập tiêu đề, nhân vật, câu mở đầu…) | Học viên A1-A2 không biết một tình huống luyện nói cần trường gì. Đổi danh sách cứng lấy một cái form vẫn là truyền thống, chỉ thêm việc. |
| Cho model tự đặt số lượt của phiên | Số lượt thuộc thời lượng học mà học viên đã chọn. Một tình huống tự đặt ngân sách có thể tiêu hết buổi học của họ. |
| Chia sẻ chủ đề giữa các học viên | Một chủ đề mang ngữ cảnh riêng (lỗi hay lặp, từ hay sai của chính người đó). Chia sẻ là rò dữ liệu học. |
| Cho phép chủ đề riêng làm Daily Quest | Daily Quest chọn trong tập built-in có chủ đích để đa dạng hoá; chủ đề riêng là thứ học viên chủ động chọn. |
| Xoá cứng chủ đề | Phiên đã chơi vẫn nêu tên chủ đề đó; tên ấy phải còn giải được. Dùng lưu trữ mềm. |
| Bỏ luôn `coachMessage` khỏi dữ liệu | Nó vẫn là lời dạy có giá trị — chỉ là không được **tự phát**. Bỏ hẳn là mất một thứ học viên đôi khi cần. |
| Giữ dòng `COACH` trong `voiceScript` "cho nhất quán với các màn khác" | Chính nó là thứ user bảo bỏ. |

## Bất biến

- **BB1 — Máy chủ vẫn chấm.** Chủ đề chỉ là bối cảnh. Phiên học vẫn do máy chủ mở, giới hạn và chấm.
- **BB2 — Model chỉ quyết phần hư cấu.** Nhân vật, nơi chốn, câu mở đầu. Không quyết số lượt, không quyết điểm.
- **BB3 — Rào kiểm hình dạng ≠ kiểm quyền.** `isKnownScenarioKey` chỉ nói "khoá này có dạng hợp lệ". Quyền sở hữu kiểm **đúng một chỗ**: `loadCustomMissionTemplate`.
- **BB4 — Orchestrator không đụng database.** Template được caller nạp rồi truyền vào.
- **BB5 — Im lặng là mặc định.** Không tự đọc, không tự dịch lời giải thích. Chỉ khi học viên bấm.
- **BB6 — Migration cộng thêm.** Một bảng mới, nullable-an toàn; bản deploy cũ vẫn chạy được.
- **BB7 — Mỗi lượt sinh chủ đề đi qua ngân sách AI** như mọi tính năng AI khác, và đầu ra **được validate** trước khi một trường nào của nó chạm vào prompt.
