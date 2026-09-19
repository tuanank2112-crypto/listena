# TESTING & ACCEPTANCE

## 1. Ma trận test

| Mã | Điều được ghim | Nơi | Loại |
|---|---|---|---|
| T221-01 | Đường đi đúng năm bước, đúng thứ tự | `lesson-journey.test.ts` | unit |
| T221-02 | Mỗi bước có nhãn tiếng Việt, đánh số từ 1, **không** lộ tên enum | như trên | unit |
| T221-03 | `isLessonJourneyStep` chỉ nhận đúng tên bước | như trên | unit |
| T221-04 | Chưa làm gì thì bắt đầu ở LEARN, 0% | như trên | unit |
| T221-05 | Phần trăm tiến theo số bước xong | như trên | unit |
| T221-06 | Xong hết thì `isComplete`, `nextStep` là null | như trên | unit |
| T221-07 | **Nhảy cóc thì bị đưa về bước đã bỏ qua** | như trên | unit |
| T221-08 | Danh sách trả về theo thứ tự đường đi, không theo thứ tự hoàn thành | như trên | unit |
| T221-09 | Tên bước lạ bị bỏ qua, không làm vỡ trang | như trên | unit |
| T221-10 | Bước lặp chỉ tính một lần | như trên | unit |
| T221-11 | LEARN chỉ tính khi có bản ghi | như trên | unit |
| T221-12 | PRACTICE tính từ một lần làm bài | như trên | unit |
| T221-13 | PLAY/LISTEN tính từ đúng mode; QUIZ không tính cho bước nào | như trên | unit |
| T221-14 | TEST chỉ đóng khi **mọi** exercise đạt ngưỡng | như trên | unit |
| T221-15 | Một exercise dưới ngưỡng là chưa đóng | như trên | unit |
| T221-16 | **Bài không có exercise thì TEST không bao giờ đóng** | như trên | unit |
| T222-01 | Combo đếm đúng chuỗi đúng liên tiếp | `run-progress.test.ts` | unit |
| T222-02 | Sai thì đứt chuỗi, nhưng `bestStreak` được nhớ | như trên | unit |
| T222-03 | **Đọc theo `position`, câu tới muộn không thổi phồng combo** | như trên | unit |
| T222-04 | **Lượt chưa trả lời bị bỏ qua, không tính là sai** | như trên | unit |
| T222-05 | Điểm là tổng điểm máy chủ, làm tròn | như trên | unit |
| T222-06 | Thiếu điểm thì tính 0, không lỗi | như trên | unit |
| T222-07 | Run rỗng và run chưa ai chơi đều trả về 0 | như trên | unit |
| T222-08 | Không làm thay đổi mảng đầu vào | như trên | unit |
| T222-09 | `comboLabelVi` im lặng dưới 2, nói từ 2 trở lên | như trên | unit |
| T223-01 | Ẩn danh đọc/ghi hành trình đều `401`, không chạm DB | `journey/route.test.ts` | unit |
| T223-02 | Chỉ đọc hành trình của chính caller và bài đó | như trên | unit |
| T223-03 | Bài chưa xuất bản cho `404` và **không ghi gì** | như trên | unit |
| T223-04 | `POST` ghi LEARN và trả hành trình đã cập nhật | như trên | unit |
| T223-05 | Lỗi cấu hình DB không rò thông điệp máy chủ | như trên | unit |
| T224-01 | Route từ chối ẩn danh; bài không có thật cho `404` (HTTP thật) | `e2e/lesson-journey.spec.ts` | E2E |
| T224-02 | Trang bài học hiện đủ **5 bước**, **không** chữ enum nào lọt ra | như trên | E2E |
| T224-03 | **Đọc hết thẻ từ mới tick được bước LEARN**, và nó sống qua một lần đọc lại từ API | như trên | E2E |
| T224-04 | Lượt MATCH gắn bài đóng bước PLAY | như trên | E2E |
| T224-05 | **Lượt của học viên khác không đóng bước của mình** | như trên | E2E |
| T224-06 | Trang game bỏ qua `lesson` không có thật, nhận `lesson` hợp lệ | như trên | E2E |

## 2. Bằng chứng nghiệm thu

| Gate | Trước Plan22 | Sau Plan22 |
|---|---|---|
| `npm run type-check` | 0 lỗi | **0 lỗi** |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | **0 lỗi / 0 cảnh báo** |
| `npx vitest run` | 135 file / 887 test | **138 file / 921 test** |
| `npm run build` | PASS | **PASS**, có `/api/learner/lessons/[lessonId]/journey` |
| `npx playwright test` | 46/46 | **50/50** |
| `prisma migrate status` | 10 migration | **11**, cái mới đang chờ trên `dev.db` (cố ý không áp) |

### Bằng chứng khác biệt thật

1. **Combo giờ là số của máy chủ.** Trước đây client cộng `Math.max(10, round(result.score * 20))` mỗi câu đúng — một con số không tồn tại ở đâu trên máy chủ. Nay nó hiển thị `progress.totalScore`, chính là tổng `score` của các round đã lưu.
2. **Bước PLAY/LISTEN chỉ đóng bởi lượt chơi của bài đó.** Ghim bằng E2E T224-05: lượt SPELL của một học viên khác trên **cùng bài** không đóng bước LISTEN của học viên đang xem.
3. **LEARN tốn đúng công sức nó tuyên bố.** E2E T224-03 phải lật hết thẻ mới bấm được "Đã đọc hết"; mở ra đóng ngay không ghi gì.

## 3. Exit Gates

| Gate | Trạng thái |
|---|---|
| 5 gate local xanh | ✅ local / ⬜ server |
| Migration cộng thêm, `dev.db` không bị đụng | ✅ local |
| Migration đã áp lên Turso production + kiểm integrity | ⬜ server |
| Deploy sau migration, nghiệm thu route mới | ⬜ server |
| Một học viên thật đi hết một chặng trên production | ⬜ server |
