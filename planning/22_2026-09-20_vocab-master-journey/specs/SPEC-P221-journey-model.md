# SPEC-P221 — Năm bước và cách suy ra chúng

File: `src/core/learning/lesson-journey.ts`, `src/server/learning/lesson-journey.ts`.

## 1. Đường đi

| # | Bước | Nhãn | Làm gì |
|---|---|---|---|
| 1 | `LEARN` | Học từ | Lật qua từng từ của bài: nghĩa, phát âm, ví dụ |
| 2 | `PRACTICE` | Luyện tập | Làm bài tập của bài học |
| 3 | `PLAY` | Ghép từ | Game ghép từ bằng **từ của bài này** |
| 4 | `LISTEN` | Nghe và viết | Chính tả bằng **từ của bài này** |
| 5 | `TEST` | Kiểm tra | Làm đúng hết bài tập |

Thứ tự lấy nguyên từ app tham khảo: gặp từ, dùng từ, chơi với từ, nghe từ, rồi chứng minh đã thuộc.

## 2. Suy ra, không ghi hai lần

`deriveCompletedSteps` nhận **bằng chứng** và trả về danh sách bước đã xong:

- `LEARN` khi có dòng trong `LessonJourneyProgress`
- `PRACTICE` khi `bestScoreByExercise.size > 0`
- `PLAY` khi mode `MATCH` có trong các lượt COMPLETED gắn bài
- `LISTEN` khi mode `SPELL` có trong các lượt đó
- `TEST` khi bài có exercise, **mọi** exercise đều có điểm, và điểm tốt nhất của **mỗi** cái đạt ngưỡng

**BẮT BUỘC** dùng **điểm tốt nhất** của mỗi exercise, không phải lần làm gần nhất: một lần làm lại tệ hơn **CẤM** xoá đi thành tích học viên đã đạt được.

**BẮT BUỘC** `exerciseCount > 0` mới xét `TEST`. Bài không có bài tập nào mà đóng được bước cuối là cho không.

## 3. Ngưỡng `LESSON_TEST_PASS_SCORE = 80`

App tham khảo lặp bài kiểm tra **tới 100%**. Không sao chép con số đó được: ListenAI chấm văn tự do có điểm thành phần, nên một câu chính tả có thể đúng theo mọi nghĩa mà vẫn không đạt 100. Một cổng **không bao giờ đóng được** sẽ khiến hành trình nói dối về chính nó.

80 là cao nhưng với tới được. **CẤM** hạ xuống cho "dễ hoàn thành" — khi đó bước TEST không còn nghĩa gì.

## 4. Vùng cấm

- **CẤM** thêm đường ghi cho PRACTICE, PLAY, LISTEN, TEST. Chúng là hàm của bằng chứng, không phải bản ghi. Thêm vào là tạo bản sao thứ hai của sự thật, và bản sao nào cũng trôi.
- **CẤM** để client gửi tên bước lên `POST`. Xem `01-CONTRACTS.md` mục 4.
- **CẤM** chặn bước chưa tới lượt. Chỉ làm nổi bật, không khoá.
