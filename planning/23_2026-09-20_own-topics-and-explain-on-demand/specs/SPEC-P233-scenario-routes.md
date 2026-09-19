# SPEC-P233 — Endpoint và quyền sở hữu

File: `src/app/api/learner/mission-scenarios/route.ts`, `[scenarioId]/route.ts`.

## 1. Ba route, một chủ sở hữu

| Route | Làm gì |
|---|---|
| `GET /api/learner/mission-scenarios` | Chủ đề còn hiệu lực của caller, mới nhất trước |
| `POST /api/learner/mission-scenarios` | `{ prompt }` 6..240 ký tự, `.strict()` — AI viết một chủ đề mới |
| `DELETE /api/learner/mission-scenarios/{id}` | Lưu trữ mềm |

**CẤM** bất kỳ route nào nhận `userId` từ client. `userId` đến từ phiên đăng nhập, không từ đâu khác.

## 2. Xoá của người khác trả 404, không phải 403

`archiveLearnerMissionScenario` dùng `updateMany` với `where: { id, userId, archivedAt: null }` rồi xét `count > 0`.

**Đây chính là phép kiểm quyền**, và nó cố ý trả **404**: một `403` sẽ xác nhận rằng chủ đề đó tồn tại và thuộc về ai đó. Chủ đề của người khác và chủ đề không tồn tại phải **không phân biệt được** từ bên ngoài. Đã ghim bằng E2E.

## 3. Bảng lỗi và hành vi bắt buộc của caller

| Tình huống | Mã | Caller phải làm |
|---|---|---|
| Không có phiên | `401` | Để layout đẩy về `/login`. **CẤM** hiện danh sách rỗng như thể học viên chưa có chủ đề nào. |
| Thân yêu cầu sai dạng | `400` | Hiện câu nhắc mô tả tình huống; **CẤM** in lỗi zod. |
| Đủ 12 chủ đề | `409` + `code: "SCENARIO_LIMIT"` | Hiện đúng câu máy chủ trả về (đã nói rõ phải xoá bớt). |
| Provider lỗi | `503` + `code: "AI_UNAVAILABLE"` | **BẮT BUỘC** nói là hệ thống chưa tạo được. **CẤM** đổ cho câu học viên viết — họ không làm gì sai. |
| Cấu hình/DB hỏng | mã của `databaseErrorResponse` | Thân đục; **CẤM** in thông điệp máy chủ. |

## 4. Thời gian chờ

`POST` đặt `maxDuration = 120`. Vyce là gateway và một lượt gọi nguội đã đo được **60.5 giây** trên production (ghi 2026-09-19). Một chủ đề nhỏ hơn nhiều một bài học, nhưng ngân sách phải chịu được lượt nguội.

## 5. Vùng cấm

- **CẤM** để `GET` trả chủ đề đã lưu trữ. Nhưng **BẮT BUỘC** `loadCustomMissionTemplate` vẫn giải được chúng — hai yêu cầu khác nhau, đừng gộp thành một truy vấn.
- **CẤM** thêm route sửa chủ đề. Muốn khác thì tạo cái mới; sửa một chủ đề mà phiên cũ đang trỏ tới là viết lại lịch sử học.
