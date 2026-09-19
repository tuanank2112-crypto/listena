# SPEC-P202 — Trang "Từ yếu" (`/learner/vocabulary`)

File: `src/app/learner/vocabulary/page.tsx`, `vocabulary-review-client.tsx`; route `src/app/api/learner/vocabulary-review/route.ts`; mục nav trong `src/components/app-shell.tsx`.

## 1. Vì sao là một trang riêng

Màn **Ôn từ** (`/learner/flashcards`) là một luồng ôn toàn màn hình: hết thẻ đến hạn là nó hiện "Xong hôm nay!". Nhét bảng "từ hay sai" vào đó thì đúng lúc học viên muốn xem lại nhất — ngay sau khi ôn xong — trang lại đang ở trạng thái rỗng. Nên tách trang.

Mục nav **"Từ yếu"** đặt ngay sau "Ôn từ". Nav học viên từ 8 lên 9 mục; lưới di động `grid-cols-5` vẫn đúng hai hàng (5 + 4).

## 2. Cấu trúc

| Phần | Nội dung | Bất biến |
|---|---|---|
| Ba ô đếm | `weakCount` "hay sai", `learnedCount` "đã thuộc", `seenCount` "đã gặp" | Số do máy chủ đếm; client **CẤM** tự đếm lại từ mảng đã bị cắt giới hạn. |
| `section` gắn `weak-words-heading` | Danh sách từ hay sai: số lần sai, từ, nghĩa, nhãn "đến hạn ôn", nút nghe | Rỗng thì phải nói rõ "chưa có từ nào bạn trả lời sai"; **CẤM** hiện khung rỗng không giải thích. |
| `section` gắn `random-review-heading` | Lưới thẻ: từ, IPA, nút nghe, nút "Xem nghĩa"; nút "Nhóm từ khác" tải lại | "Xem nghĩa" **CẤM** gọi API. "Nhóm từ khác" là gọi lại chính route để máy chủ bốc lại. |
| CTA cuối | "Chơi nhanh để tính điểm" dẫn `/learner/games`; "Học cùng AI" dẫn dashboard | **BẮT BUỘC** có ít nhất một CTA về mặt có chấm điểm, để trang này không bị hiểu là nơi luyện tập tính điểm. |

## 3. Vùng cấm

- **CẤM** ghi bất cứ thứ gì khi học viên mở nghĩa. Đây là khác biệt cố ý với app tham khảo — app đó chấm ở client và ghi `wrongCount` từ chính màn tự kiểm tra.
- **CẤM** để client lọc hay sắp xếp lại danh sách máy chủ gửi.
- **CẤM** thêm state vào `localStorage`. Trạng thái "đã mở nghĩa" chỉ sống trong một lần xem và reset khi tải lại nhóm.
- **CẤM** dùng trang này làm nơi bắt đầu một Mission mới (tốn một lượt AI).

## 4. Xử lý lỗi

Một khung `role="alert"` kèm nút "Thử lại" cho mọi lỗi tải. Không phân biệt loại lỗi trên giao diện — thân lỗi của máy chủ đã đục theo contract.
