# SPEC-P223 — Game chơi bằng từ của bài

File: `src/server/adaptive-games/contracts.ts`, `service.ts`, `src/app/learner/games/page.tsx`.

## 1. Vì sao cần

Bước `PLAY` và `LISTEN` nói "chơi với từ của **bài này**". Nếu lượt chơi lấy từ toàn bộ giáo trình thì việc đánh dấu bước xong là **nói dối**: học viên đã hoàn thành một thứ khác.

## 2. Hợp đồng

`CreateAdaptiveGameRunSchema` nhận thêm `lessonId?: string` (UUID), vẫn `.strict()`.

Khi có `lessonId`:

- Kho từ lọc theo `lessons: { some: { lessonId, lesson: { status: "PUBLISHED" } } }`.
- **Không** lấy từ riêng tư (personalized lesson). Học viên bấm "chơi bài này" thì phải là từ của bài đó.
- Lượt chơi lưu `lessonId`, nên hoàn thành nó đóng đúng bước của đúng bài.

Mọi thứ phía sau — chọn lượt, dựng vòng, `selectionSnapshotHash`, batch nguyên tử — **không đổi**. Đây là một bộ lọc cộng thêm ở đầu vào, không phải một nhánh xử lý mới.

## 3. Trang game

`/learner/games?lesson=<id>&mode=match` hoặc `mode=spell`. Id được kiểm **trên máy chủ**:

- Không tồn tại hoặc chưa xuất bản thì **bỏ qua im lặng**, trở thành lượt chơi tự do bình thường. Link gõ tay **CẤM** tạo được lượt trỏ vào bài chưa xuất bản.
- Hợp lệ thì hiện dòng "Đang chơi với từ của bài: …" và tự mở chế độ đó **đúng một lần** (có ref chặn), **không** thử lại khi lỗi — khi đó học viên tự chọn với thông báo lỗi ngay trước mắt.

## 4. Vùng cấm

- **CẤM** để client quyết bài nào là hợp lệ. `lessonId` đi vào máy chủ và được kiểm ở đó.
- **CẤM** trộn từ ngoài bài vào một lượt chơi gắn bài, kể cả để "đủ số lượt". Thiếu từ thì báo lỗi hiện có (`AdaptiveGameConflictError`), không bù bằng từ lạ.
