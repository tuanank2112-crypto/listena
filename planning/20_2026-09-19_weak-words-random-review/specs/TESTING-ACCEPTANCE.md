# TESTING & ACCEPTANCE

## 1. Ma trận test

| Mã | Điều được ghim | Nơi | Loại |
|---|---|---|---|
| T201-01 | Sai một lần là `weak`, kể cả khi đã đúng chín lần | `weak-words.test.ts` | unit |
| T201-02 | `learned` cần đúng từ 2 lần và chưa từng sai; đúng 1 lần là `shaky` | như trên | unit |
| T201-03 | `dueNow` đúng cho quá hạn / chưa tới hạn / chưa có lịch | như trên | unit |
| T201-04 | Xếp hạng: nhiều lần sai lên trước | như trên | unit |
| T201-05 | Cùng số lần sai thì độ chính xác thấp hơn lên trước | như trên | unit |
| T201-06 | **Thứ tự ổn định**: đảo đầu vào vẫn ra cùng thứ tự | như trên | unit |
| T201-07 | Tôn trọng `limit` | như trên | unit |
| T201-08 | Cùng số bốc thì từ yếu hơn thắng | như trên | unit |
| T201-09 | **Từ nắm chắc vẫn có thể lọt nhóm ngẫu nhiên** | như trên | unit |
| T201-10 | `count <= 0` cho mảng rỗng; không bao giờ nhiều hơn số yêu cầu hay số đang có | như trên | unit |
| T201-11 | `countLearned` chỉ đếm từ đúng từ 2 lần và sai 0 | như trên | unit |
| T202-01 | Gọi ẩn danh cho `401` và **không** chạm DB | `route.test.ts` | unit |
| T202-02 | Truy vấn lọc đúng `userId` của phiên | như trên | unit |
| T202-03 | Danh sách xấu nhất trước, ba ô đếm đúng | như trên | unit |
| T202-04 | Nghĩa được làm sạch bằng đúng `cleanVocabularyMeaning` như mọi mặt khác | như trên | unit |
| T202-05 | Không trả nhiều từ ngẫu nhiên hơn số đang có | như trên | unit |
| T202-06 | Lỗi cấu hình DB: thân phản hồi **không chứa** thông điệp cấu hình của máy chủ | như trên | unit |
| T202-07 | Route từ chối caller ẩn danh qua HTTP thật | `e2e/vocabulary-review.spec.ts` | E2E |
| T202-08 | Học viên thấy từ hay sai, xấu nhất trước; từ chưa sai lần nào **không** xuất hiện | như trên | E2E |
| T202-09 | Nhóm ngẫu nhiên giấu nghĩa tới khi bấm; chỉ thẻ được bấm mở ra | như trên | E2E |
| T202-10 | **Từ của học viên khác không bao giờ rời máy chủ** | như trên | E2E |
| T203-01 | Ba nút tốc độ hiện tại vòng chính tả; mức đang chọn mang `aria-pressed="true"` và đổi được | `e2e/voice-everywhere.spec.ts` | E2E |

## 2. Bằng chứng nghiệm thu (số thật, không phải "test xanh")

| Gate | Trước Plan20 | Sau Plan20 |
|---|---|---|
| `npm run type-check` | 0 lỗi | **0 lỗi** |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | **0 lỗi / 0 cảnh báo** |
| `npx vitest run` | 129 file / 823 test | **131 file / 840 test** |
| `npm run build` | PASS | **PASS**, danh sách route có `/learner/vocabulary` và `/api/learner/vocabulary-review` |
| `npx playwright test` | 40/40 | **43/43** |

### Bằng chứng riêng cho flake `timeline.spec.ts`

Trước: fail khoảng **1 lượt trong 3** kể từ 2026-09-17 (ghi trong `state.json`, mục `root_verify_2026_09_17_second_pass.new_issues.e2e_flake`). Trong chính lượt làm Plan20 cũng bắt được một lần fail, và lần này đọc được nguyên nhân: `DatabaseUnavailableError`, tức `SQLITE_BUSY` do tiến trình test và tiến trình server cùng ghi một file SQLite.

Sau khi đặt WAL: **43/43 ba lượt liên tiếp**, 1.6-1.7 phút mỗi lượt.

## 3. Exit Gates

| Gate | Trạng thái |
|---|---|
| 5 gate local xanh | ✅ local / ⬜ server |
| E2E ổn định 3 lượt liên tiếp | ✅ local / ⬜ server |
| Không migration, không env mới, không dependency mới | ✅ local / ⬜ server |
| Nghiệm thu trên production (`/learner/vocabulary` trả 307 về login, API trả 401 khi ẩn danh) | ⬜ server |
| Có học viên thật mở được trang trên production | ⬜ **CHẶN bởi `NEXTAUTH_URL`** — xem Plan19 |
