# TESTING & ACCEPTANCE

## 1. Ma trận test

| Mã | Điều được ghim | Nơi | Loại |
|---|---|---|---|
| T231-01 | `voiceScript` chỉ còn NPC và RECAST | `voice-script.test.ts` | unit |
| T231-02 | **Không dòng nào `lang: "vi"`**, và lời Coach không lọt vào chuỗi đọc | như trên | unit |
| T231-03 | Lượt không có gì để nói vẫn trả `null` | như trên | unit |
| T231-04 | Lượt chỉ có `npcReply` vẫn được đọc | như trên | unit |
| T231-05 | Câu sai của học viên vẫn không bao giờ là mẫu (giữ từ Plan14) | như trên | unit |
| T231-06 | Lời Coach **không** hiện cho tới khi bấm, và vẫn thế sau khi tải lại trang | `e2e/learning-regressions.spec.ts` | E2E |
| T232-01 | Schema nhận một chủ đề đúng dạng | `scenario-author.test.ts` | unit |
| T232-02 | Từ chối chủ đề có quá ít từ để luyện | như trên | unit |
| T232-03 | Từ chối câu mở đầu dài như một bài văn | như trên | unit |
| T232-04 | Bắt buộc có `summaryVi` | như trên | unit |
| T232-05 | Cắt khoảng trắng thay vì lưu vào | như trên | unit |
| T232-06 | JSON schema khớp đúng các trường zod đòi | như trên | unit |
| T232-07 | **`additionalProperties: false`** — model không nhét thêm trường | như trên | unit |
| T232-08 | System prompt có luật cho yêu cầu không an toàn và **không nhắc lại nó** | như trên | unit |
| T232-09 | System prompt cấm nhắc trình độ hay lỗi của học viên trong hư cấu | như trên | unit |
| T232-10 | Câu của học viên đi qua nguyên vẹn, chỉ cắt khoảng trắng | như trên | unit |
| T232-11 | **Mọi danh sách bị cắt** (5 / 3 / 8) | như trên | unit |
| T232-12 | Câu rất dài bị cắt còn 240 ký tự | như trên | unit |
| T232-13 | **`maxTurns` là của máy chủ**, không phải của model | như trên | unit |
| T232-14 | `summaryVi` **không** lọt vào prompt của tutor | như trên | unit |
| T233-01 | Cả ba route từ chối caller ẩn danh | `e2e/mission-scenarios.spec.ts` | E2E |
| T233-02 | Học viên chỉ thấy chủ đề của mình | như trên | E2E |
| T233-03 | **Xoá chủ đề người khác trả `404` và không xoá được gì** | như trên | E2E |
| T233-04 | Xoá chủ đề của mình thì nó biến khỏi danh sách | như trên | E2E |
| T234-01 | Chủ đề hiện trên trang Trò chơi | như trên | E2E |
| T234-02 | **Vào vai chủ đề của người khác trả `404`; chủ đề của mình mở được Mission** | như trên | E2E |

## 2. Bằng chứng nghiệm thu

| Gate | Trước Plan23 | Sau Plan23 |
|---|---|---|
| `npm run type-check` | 0 lỗi | **0 lỗi** |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | **0 lỗi / 0 cảnh báo** |
| `npx vitest run` | 138 file / 921 test | **139 file / 939 test** |
| `npm run build` | PASS | **PASS**, có 2 route scenario |
| `npx playwright test` | 50/50 | **53/53** |

### Bằng chứng khác biệt thật

1. **Reasoning không còn tự phát.** `e2e/learning-regressions.spec.ts` trước đây khẳng định lời Coach **hiện ngay** sau khi chấm — và nó **đỏ** sau thay đổi này. Test nay khẳng định điều ngược lại: không hiện, bấm `Giải nghĩa` mới hiện, và lặp lại sau khi tải lại trang. Một test phải đổi chiều là bằng chứng hành vi đã thật sự đổi.
2. **Chủ đề là dữ liệu.** E2E tạo chủ đề bằng cách ghi thẳng vào bảng rồi vào vai được nó — không sửa một dòng mã nào. Trước Plan23 điều đó bất khả thi vì khoá là union type.
3. **Ranh giới quyền sở hữu.** Cùng một E2E chứng minh khoá `custom-<id>` của người khác trả `404` khi vào vai, dù nó **đúng dạng** và qua được rào kiểm hình dạng.

## 3. Điều test KHÔNG phủ

E2E **gieo sẵn** chủ đề thay vì gọi AI thật, để một lượt chạy suite không tốn lượt AI và không phụ thuộc gateway. Nghĩa là **đường sinh chủ đề bằng AI thật chưa được nghiệm thu tự động**. Phải thử tay một lần trên production sau khi deploy — ghi trong [`OPERATIONS.md`](OPERATIONS.md) mục 3.

## 4. Exit Gates

| Gate | Trạng thái |
|---|---|
| 5 gate local xanh | ✅ local / ⬜ server |
| Migration cộng thêm, `dev.db` không bị áp | ✅ local |
| Migration áp lên production + integrity | ⬜ server |
| Deploy sau migration | ⬜ server |
| **Tạo một chủ đề bằng AI thật và vào vai nó** | ⬜ server |
