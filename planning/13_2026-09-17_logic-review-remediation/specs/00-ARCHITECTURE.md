# 00 — Kiến trúc Plan13

## Mục tiêu

1. Đóng toàn bộ findings của rà soát logic 2026-09-17 (5 P1, 17 P2, ~30 P3) bằng sửa code có test hồi quy, không đổi framework.
2. Làm "học với AI" chạy được end-to-end với Vyce: Mission/Coach/Tutor đã ổn; **Bài AI riêng** phải sinh được trong ngưỡng gateway; không còn phiên kẹt.
3. Thay cách điền đáp án truyền thống bằng **Answer Canvas** (3 chế độ + cược tự tin), vẫn chấm điểm server.

## Non-goals (vùng cấm phạm vi)

CẤM: STT/nhận dạng giọng nói; streaming token; đổi provider ngoài Vyce/OpenAI; JWT revocation toàn cục (chỉ làm role refresh có thời hạn); redesign toàn bộ UI; thêm framework state; đổi SM-2; migration phá huỷ dữ liệu; đụng `prisma/dev.db`, Turso, Vercel từ agent.

## Bất biến (kế thừa Plan11/12 + bổ sung)

- BẮT BUỘC server giữ đáp án và chấm điểm. Client chỉ nhận **mức trợ giúp đã trả giá** qua assist endpoint (SPEC-P133) và mức đó được ghi vào `hintCount`.
- BẮT BUỘC mọi mutation học tập idempotent theo `(owner, clientKey)`; commit lỗi không để lại row không áp dụng; lease/fence phải **dài hơn** thời gian call dài nhất có thể (provider 180s).
- BẮT BUỘC học viên luôn có lối thoát khỏi phiên AI (huỷ hoặc bắt đầu mới) mà không cần AI thành công.
- BẮT BUỘC route trả mã lỗi typed + `Retry-After` đúng nghĩa: `AI_MISCONFIGURED` (không retry), `AI_RATE_LIMITED` (retry sau N), `AI_UNAVAILABLE` (retry), `START_OUTCOME_UNKNOWN` (chỉ khi thật sự không biết).
- BẮT BUỘC route mail (reset/verification/register) có **thời gian phản hồi độc lập với sự tồn tại của tài khoản** và cùng thân phản hồi.
- BẮT BUỘC migration additive; cột mới có default; không DROP.
- CẤM đọc `process.env` ngoài resolver đã có; CẤM log secret/token/đáp án.

## Nguyên nhân gốc đã đo (để worker không đoán lại)

- Vyce trả **524** ở ~125s cho output 2.200 token; 1.200 token trả 7–10s ổn định (n=7). ⇒ rút gọn output là biện pháp chính; async là lưới an toàn.
- `ACTIVE_SESSION_EXISTS` xuất hiện ngay khi học viên bấm "Học cùng AI" ở bài học sau khi mở Mission ở dashboard mà chưa trả lời. ⇒ cần huỷ tự động phiên rỗng hoặc lựa chọn tường minh.

## Ma trận lỗi cấp kế hoạch

| Tình huống | Hành vi bắt buộc |
|---|---|
| Worker cần đổi file thuộc WP khác | Dừng, ghi vào báo cáo, root điều phối. Không sửa chéo. |
| Test cũ mâu thuẫn với contract mới | Sửa test **kèm** giải thích trong commit message/báo cáo; không xoá assertion bất biến. |
| Không tái hiện được finding | Ghi "không tái hiện" + bằng chứng; root quyết. |
| Cần migration | Chỉ additive, đặt tên `2026091723xx_plan13_<slug>`, có `ALTER TABLE ADD COLUMN ... DEFAULT`. |
