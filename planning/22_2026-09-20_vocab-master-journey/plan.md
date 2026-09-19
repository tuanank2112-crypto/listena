# Kế hoạch 22 — Vocab Master: chặng học 5 bước và combo do máy chủ tính

## Metadata Header

| Trường | Giá trị |
|---|---|
| Mã kế hoạch | 22_2026-09-20_vocab-master-journey |
| Loại | MINOR (SemVer) — đủ bộ SPEC theo luật §2 |
| Phiên bản dự án | 0.7.0 (bump là quyết định của user) |
| Ngày mở | 2026-09-20 |
| Trạng thái | LOCAL ACCEPTED — 5/5 gate xanh; **có migration, chưa áp lên production** |
| Nguồn yêu cầu | User: "làm cái vocab master đi. đợi gì nữa?" (2026-09-20) — duyệt migration một cách tường minh |
| Phạm vi | Hai mảng Plan20 đã hoãn: vòng học 5 bước và combo do máy chủ tính |

## Bảng trỏ SPEC

| File | Nội dung |
|---|---|
| [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) | Quyết định nền "suy ra, đừng ghi hai lần"; non-goals; 7 bất biến |
| [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) | Schema, chữ ký hàm, endpoint, bảng lỗi |
| [`specs/SPEC-P221-journey-model.md`](specs/SPEC-P221-journey-model.md) | Năm bước và cách suy ra |
| [`specs/SPEC-P222-server-combo.md`](specs/SPEC-P222-server-combo.md) | Combo và điểm |
| [`specs/SPEC-P223-lesson-scoped-games.md`](specs/SPEC-P223-lesson-scoped-games.md) | Game bằng từ của bài |
| [`specs/SPEC-P224-journey-ui.md`](specs/SPEC-P224-journey-ui.md) | Dải hành trình và màn học từ |
| [`specs/OPERATIONS.md`](specs/OPERATIONS.md) | **Thứ tự bắt buộc: migration trước, deploy sau** |
| [`specs/TESTING-ACCEPTANCE.md`](specs/TESTING-ACCEPTANCE.md) | 32 ca test + bằng chứng |

## Nhật ký quyết định

### 2026-09-20 03:05 — Khảo sát trước: hoá ra combo không cần migration

Trước khi thiết kế, đọc schema thật. `AdaptiveGameRound` **đã** lưu `correct` và `score` theo `position`, nên **combo suy ra được ngay, không cần cột nào**. Thứ thiếu không phải dữ liệu mà là việc máy chủ chưa bao giờ **báo** con số đó ra, còn client thì tự bịa lấy một con số khác.

Phát hiện này cắt một nửa phần cần migration trước khi viết dòng mã đầu tiên.

### 2026-09-20 03:20 — Quyết định nền: suy ra, đừng ghi hai lần

Cách hiển nhiên cho vòng 5 bước là ghi một dòng "đã xong bước X" mỗi khi học viên nộp bài, chơi xong, nghe xong. **Đã loại.**

Nó tạo **bản sao thứ hai của sự thật**, và bản sao nào cũng trôi: một lượt ghi hỏng, một đợt deploy giữa chừng, một lần dọn dữ liệu — thế là hành trình nói một đằng, bằng chứng nói một nẻo. Rồi sẽ có người phải viết script đối soát.

Đối chiếu từng bước với dữ liệu đã có thì thấy **bốn trên năm bước suy ra được**: PRACTICE từ `Attempt`, PLAY/LISTEN từ lượt chơi COMPLETED gắn bài, TEST từ điểm mọi exercise. Chỉ `LEARN` — "học viên đã đọc các từ" — là **không nơi nào ghi**.

Nên bảng mới tồn tại vì **đúng một** bước, và hành trình **không thể** lệch khỏi bằng chứng vì không có bản sao nào để lệch.

### 2026-09-20 03:35 — Ngưỡng 80, không phải 100

App tham khảo lặp bài kiểm tra tới 100%. Không sao chép được: ListenAI chấm văn tự do có điểm thành phần, nên một câu chính tả có thể đúng theo mọi nghĩa mà vẫn không đạt 100. Cổng không bao giờ đóng được sẽ khiến hành trình **nói dối về chính nó**.

Chọn 80: cao nhưng với tới được. Và dùng **điểm tốt nhất** mỗi exercise, không phải lần làm gần nhất — làm lại tệ hơn không được xoá thành tích đã đạt.

### 2026-09-20 03:50 — Game gắn bài: bộ lọc ở đầu vào, không phải nhánh mới

Bước PLAY/LISTEN nói "chơi với từ của bài này". Nếu lượt chơi lấy từ toàn giáo trình thì đánh dấu bước xong là nói dối.

`AdaptiveGameRun` là hệ con đã được kiểm rất kỹ (chọn lượt tất định theo seed, `selectionSnapshotHash`, batch nguyên tử). Nên thay đổi được giữ ở **đúng một chỗ**: kho từ ứng viên. Có `lessonId` thì lọc theo bài và **không** lấy từ riêng tư. Mọi thứ phía sau không đổi một dòng.

### 2026-09-20 04:05 — Combo đọc ngoài batch nguyên tử

Có thể nhét một lần đọc vào trong batch để đỡ một truy vấn. **Đã loại.** Batch là ranh giới bền vững của câu trả lời; combo chỉ là **cách nhìn** vào thứ nó vừa ghi. Đổi rủi ro thật lấy một lần đọc là một vụ trao đổi tồi.

`loadRunProgress` chạy **sau** khi batch trả về, phạm vi `{ runId, run: { userId } }`.

### 2026-09-20 04:15 — LEARN phải tốn đúng công sức nó tuyên bố

LEARN là bước duy nhất **không có bằng chứng thật** đứng sau — nó tin lời học viên. Nên nó phải khó gian: chỉ nút ở **thẻ từ cuối cùng** mới ghi. Mở ra rồi đóng ngay không tính.

Và **CẤM** cho client gửi tên bước lên `POST`: nếu client chọn được bước thì nó tự cấp cho mình 100%.

## Work Packages

| WP | Nội dung | Trạng thái |
|---|---|---|
| WP1 | Schema + migration viết tay, cộng thêm hoàn toàn | ✅ |
| WP2 | `lesson-journey.ts` lõi + 17 test | ✅ |
| WP3 | `run-progress.ts` lõi + 11 test | ✅ |
| WP4 | Server journey (suy ra + ghi LEARN) | ✅ |
| WP5 | Game gắn bài: contract, kho từ, cột `lessonId` | ✅ |
| WP6 | Combo vào `PublicGameAnswerResult`; client bỏ điểm tự bịa | ✅ |
| WP7 | `GET/POST /api/learner/lessons/[id]/journey` + 6 test | ✅ |
| WP8 | Dải hành trình + màn học từ + gắn vào trang bài học | ✅ |
| WP9 | Trang game nhận `?lesson=&mode=` | ✅ |
| WP10 | 4 ca E2E | ✅ |
| WP11 | Bộ SPEC + đồng bộ não | ✅ |
| WP12 | **Áp migration lên Turso production**, rồi deploy | ⬜ |

## Checklist thực thi

- [x] Đọc schema trước khi thiết kế (và phát hiện combo không cần migration)
- [x] Chỉ ghi bước không suy ra được; bốn bước còn lại suy ra lúc đọc
- [x] Migration **cộng thêm**: bảng mới + cột nullable; `dev.db` **không** bị áp
- [x] Thay đổi game giữ trong đúng một hàm (kho từ ứng viên)
- [x] Combo đọc ngoài batch nguyên tử
- [x] E2E chứng minh lượt chơi của học viên khác không đóng bước của mình
- [x] 5 gate local
- [ ] Áp migration production, xác minh integrity, rồi deploy

## Exit Gates

| Gate | Kết quả | Môi trường |
|---|---|---|
| `npm run type-check` | 0 lỗi | ✅ local / ⬜ server |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | ✅ local / ⬜ server |
| `npx vitest run` | **138 file / 921 test** (trước 135/887) | ✅ local / ⬜ server |
| `npm run build` | PASS, có route journey | ✅ local / ⬜ server |
| `npx playwright test` | **50/50** (trước 46/46) | ✅ local / ⬜ server |
| Migration áp lên production + integrity | chưa chạy | ⬜ server |
| Nghiệm thu production | chưa chạy | ⬜ server |

## Việc còn mở

- Áp migration lên Turso production **trước** khi deploy (xem [`OPERATIONS.md`](specs/OPERATIONS.md) mục 1 — deploy trước sẽ làm hỏng production).
- Vyce chậm bất thường ở lượt đầu (60.5s) — sự cố ghi từ 2026-09-18, vẫn chưa điều tra.
