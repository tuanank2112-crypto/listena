# 00 — Kiến trúc và bất biến

## Thứ tự đọc

1. File này — mục tiêu, non-goals, bất biến.
2. [`01-CONTRACTS.md`](01-CONTRACTS.md) — kiểu dữ liệu và endpoint chính xác.
3. [`SPEC-P201-weak-words-core.md`](SPEC-P201-weak-words-core.md) — lõi phân loại và chọn từ.
4. [`SPEC-P202-vocabulary-page.md`](SPEC-P202-vocabulary-page.md) — trang "Từ yếu".
5. [`SPEC-P203-dictation-speeds.md`](SPEC-P203-dictation-speeds.md) — ba tốc độ nghe tại "Nghe & viết".
6. [`OPERATIONS.md`](OPERATIONS.md) — thứ tự triển khai, rollback.
7. [`TESTING-ACCEPTANCE.md`](TESTING-ACCEPTANCE.md) — ma trận test và Exit Gates.

## Mục tiêu

Lấy ba chức năng của app tham khảo "English Vocab Master A2-B1" (ghi trong [`docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md`](../../../docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md)) mà ListenAI **đã có đủ dữ liệu để làm nhưng chưa hiển thị cho học viên**:

1. **Từ hay sai** — học viên thấy chính xác những từ mình liên tục trả lời sai, kèm số lần.
2. **Ôn tập ngẫu nhiên** — một nhóm từ do máy chủ bốc xuyên bài, nghiêng về từ chưa chắc.
3. **Ba tốc độ nghe tại chính vòng chính tả** — 0.75× / 1.0× / 1.2×.

Điểm chung: cả ba đều **đọc lại thứ chấm điểm máy chủ đã ghi**, không thêm một nguồn chân lý nào.

## Non-goals (đã cân nhắc và quyết định KHÔNG làm)

| Không làm | Lý do |
|---|---|
| Vòng học 5 bước `learn → practice → play → listen → test` | Cần lưu trạng thái bước theo từng bài từng học viên ⇒ **đổi schema**. User đã chốt "không được thay đổi db" trong lượt này. Tách thành plan riêng khi user duyệt migration. |
| Combo / điểm tích luỹ do máy chủ tính trong game Ghép cặp | Cùng lý do: chuỗi đúng liên tiếp phải sống qua các lượt ⇒ cần cột/bảng mới. |
| Chấm điểm ở client | App tham khảo chấm ở client. ListenAI **cấm**: mọi chấm điểm và mọi ghi mastery thuộc máy chủ. |
| Chế độ `local-user` / học không đăng nhập | App tham khảo cho phép. ListenAI bắt buộc xác minh email (Plan09) và mọi bằng chứng học thuộc về một chủ sở hữu. |
| Firebase / Firestore | Nền tảng khác; ListenAI dùng Prisma + libSQL. |
| Nối `dataset/danang-getaway-lesson.json` vào giáo trình | Vùng cấm đã ghi trong Plan19; là quyết định sản phẩm của user. |
| Đổi lịch SM-2 hay thuật toán mastery | Trang mới chỉ **đọc**. |

## Bất biến kiến trúc

- **BB1 — Chỉ đọc.** Mọi thứ Plan20 thêm vào phía máy chủ là đường đọc. Không route nào của plan này ghi `VocabularyMastery`, `LearningEvidence`, `Flashcard`, `ReviewLog` hay bất kỳ bảng nào.
- **BB2 — Không đổi schema.** Không migration, không cột mới. Nếu một ý tưởng cần schema, nó thuộc Non-goals ở trên.
- **BB3 — Chọn từ ở máy chủ.** Danh sách từ hay sai và nhóm ôn ngẫu nhiên đều do máy chủ quyết định. Client không gửi tham số chọn từ, không gửi seed, không lọc lại.
- **BB4 — Phạm vi chủ sở hữu.** Mọi truy vấn lọc theo `userId` của phiên. Từ của học viên khác không bao giờ rời máy chủ.
- **BB5 — Xem nghĩa không phải là trả lời.** Nút "Xem nghĩa" ở nhóm ôn ngẫu nhiên là tự kiểm tra; nó không gọi API, không tính đúng/sai, không đổi mastery. Mọi CTA của trang dẫn về một mặt **đã có chấm điểm** (Ôn từ, Trò chơi, Mission).
- **BB6 — Đổi tốc độ không tạo request mới.** Ba nút tốc độ đổi `playbackRate` của cùng khối audio đã tải; không gọi lại route audio, không làm đáp án ẩn rời máy chủ thêm một lần nào.
