# 00 — Kiến trúc và bất biến

## Thứ tự đọc

1. File này — mục tiêu, quyết định nền, non-goals, bất biến.
2. [`01-CONTRACTS.md`](01-CONTRACTS.md) — schema, chữ ký hàm, endpoint, bảng lỗi.
3. [`SPEC-P221-journey-model.md`](SPEC-P221-journey-model.md) — năm bước và cách suy ra chúng.
4. [`SPEC-P222-server-combo.md`](SPEC-P222-server-combo.md) — combo và điểm do máy chủ tính.
5. [`SPEC-P223-lesson-scoped-games.md`](SPEC-P223-lesson-scoped-games.md) — game chơi bằng từ của bài.
6. [`SPEC-P224-journey-ui.md`](SPEC-P224-journey-ui.md) — dải hành trình và màn học từ.
7. [`OPERATIONS.md`](OPERATIONS.md) — **thứ tự triển khai bắt buộc** (migration trước, deploy sau) và rollback.
8. [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md).

## Mục tiêu

Lấy phần còn lại của [tham khảo Vocab Master](../../../docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md) mà Plan20 chưa làm:

1. **Vòng học 5 bước cho mỗi bài** — `LEARN → PRACTICE → PLAY → LISTEN → TEST`, có phần trăm và nút "đi tiếp" vào đúng bước còn dở.
2. **Combo và điểm tích luỹ do máy chủ tính** trong trò chơi.

Giá trị thật của app tham khảo không nằm ở một bài tập cụ thể nào, mà ở chỗ **học viên mở một bài ra là biết ngay phải làm gì tiếp**. Đó là thứ được lấy.

## Quyết định nền: suy ra, đừng ghi hai lần

Cách hiển nhiên là ghi một dòng "đã xong bước X" mỗi khi học viên nộp bài, chơi xong, nghe xong. **Đã loại.** Nó tạo bản sao thứ hai của sự thật, và bản sao nào cũng trôi: một lượt ghi hỏng, một đợt deploy giữa chừng, một lần xoá dữ liệu — thế là hành trình nói một đằng, bằng chứng nói một nẻo.

Thay vào đó, **bốn trên năm bước được suy ra tại thời điểm đọc** từ dữ liệu máy chủ vốn đã lưu:

| Bước | Suy ra từ |
|---|---|
| PRACTICE | có ít nhất một `Attempt` của học viên trên bài này |
| PLAY | có một `AdaptiveGameRun` **COMPLETED**, mode `MATCH`, thuộc bài này |
| LISTEN | như trên, mode `SPELL` |
| TEST | **mọi** exercise của bài đều có điểm tốt nhất ≥ `LESSON_TEST_PASS_SCORE` |
| LEARN | **không suy ra được** — không nơi nào ghi "học viên đã đọc các từ" |

Nên bảng mới chỉ tồn tại vì **một** bước. Hệ quả: hành trình **không thể** lệch khỏi bằng chứng bên dưới, vì không có bản sao nào để lệch.

## Non-goals (đã cân nhắc và quyết định KHÔNG làm)

| Không làm | Lý do |
|---|---|
| Chấm điểm ở client cho combo | App tham khảo tính combo trong trình duyệt. Ở đây mọi điểm đều do máy chủ chấm; một combo do trình duyệt đếm là một điểm số do trình duyệt tự cho. |
| Bảng xếp hạng, huy hiệu, chuỗi ngày | Vượt phạm vi tham khảo và chưa có bằng chứng nó giúp học. |
| Bắt buộc đi đúng thứ tự | Bước nào cũng mở được bất cứ lúc nào; chỉ bước kế tiếp được **làm nổi bật**. Khoá lại sẽ biến một gợi ý thành rào cản. |
| Ghi dòng tiến độ cho PRACTICE/PLAY/LISTEN/TEST | Xem quyết định nền ở trên. |
| Lặp bài kiểm tra đến 100% như app tham khảo | ListenAI chấm văn tự do có điểm thành phần, nên 100% ở mọi câu là cổng **không bao giờ đóng được**. Xem SPEC-P221 §3. |
| Đưa từ riêng tư (personalized lesson) vào game của bài | Học viên bấm "chơi bài này" thì phải là từ của bài đó, không gì khác. |

## Bất biến

- **BB1 — Máy chủ chấm, client vẽ.** Combo, điểm, phần trăm đều do máy chủ tính. Client **CẤM** tự cộng.
- **BB2 — Chỉ LEARN được ghi.** Mọi bước khác suy ra lúc đọc. **CẤM** thêm đường ghi cho chúng.
- **BB3 — Phạm vi chủ sở hữu.** Hành trình, lượt game, điểm đều lọc theo `userId` của phiên.
- **BB4 — Migration cộng thêm.** Một bảng mới và một cột **nullable**; bản deploy cũ vẫn chạy được trên schema này.
- **BB5 — Batch nguyên tử không bị đụng.** Combo đọc **sau** khi batch ghi xong, nằm ngoài nó. Ranh giới bền vững của game giữ nguyên.
- **BB6 — Lượt game gắn bài thì chỉ dùng từ của bài.** Không từ riêng tư, không từ bài khác.
- **BB7 — Hỏng thì im lặng.** Dải hành trình lỗi thì biến mất; trang bài học vẫn dùng được trọn vẹn khi thiếu nó.
