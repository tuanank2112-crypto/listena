# SPEC-P234 — Khu "Chủ đề của bạn"

File: `src/features/mission-scenarios/my-scenarios.tsx`, gắn vào `src/app/learner/games/games-client.tsx`.

## 1. Đặt ở đâu

Trên trang Trò chơi, **ngay trước** khu ba chủ đề có sẵn. Học viên thấy chỗ viết chủ đề của mình trước khi thấy danh sách sản phẩm đưa ra — thứ tự đó nói rằng chủ đề của họ mới là chính.

## 2. Một ô nhập, một câu

Một `textarea` hai dòng, tối đa 240 ký tự, placeholder là ví dụ thật (*"gọi món ở tiệm bánh mì, hỏi đường tới bến xe, phỏng vấn xin việc part-time…"*), và dòng nhắc **"tiếng Việt cũng được"**.

**BẮT BUỘC** nói rõ tiếng Việt được chấp nhận. Học viên A1-A2 không mô tả được tình huống bằng tiếng Anh — bắt họ làm vậy là dựng lại đúng rào cản mà tính năng này sinh ra để phá.

Nút bị vô hiệu dưới 6 ký tự, và trong lúc chờ đổi chữ thành **"AI đang viết…"** kèm vòng xoay. Một lượt gọi nguội mất tới cả phút; im lặng trong chừng ấy thời gian là hỏng.

## 3. Thẻ chủ đề

Mỗi thẻ: tên tình huống, dòng `nhân vật · vai`, câu tóm tắt tiếng Việt, nút **"Vào vai"** (chính là `StartSessionButton` mà ba chủ đề có sẵn đang dùng), và một nút thùng rác.

**BẮT BUỘC** dùng lại `StartSessionButton`. Chủ đề riêng phải bắt đầu **y hệt** chủ đề có sẵn — cùng hợp đồng start-request, cùng xử lý phiên đang mở. Một đường khởi động thứ hai là một chỗ để lệch.

Mỗi thẻ mang `data-scenario="<key>"` cho E2E.

## 4. Hỏng thì vẫn học được

Tải danh sách lỗi ⇒ hiện **danh sách rỗng**, không phải hộp lỗi. Ba chủ đề có sẵn và toàn bộ trang Trò chơi vẫn dùng được; một lỗi ở đây không đáng chặn ai.

Tạo lỗi thì **hiện lỗi ngay dưới nút** — chỗ đó khác: học viên vừa chủ động làm một việc và xứng đáng biết nó không thành.

## 5. Vùng cấm

- **CẤM** cho học viên sửa các trường của tình huống (nhân vật, câu mở đầu…). Đó là màn CRUD đã bị loại ở `00-ARCHITECTURE`.
- **CẤM** hiện `targetVocabulary` trên thẻ. Biết trước danh sách từ sẽ bị kiểm là biến một cuộc hội thoại thành một bài kiểm tra.
- **CẤM** tự tạo chủ đề thay học viên, kể cả từ `preferredTopics`. Sở thích của họ là **ngữ cảnh** cho câu họ viết, không phải cái cớ để sinh ra thứ họ không yêu cầu.
