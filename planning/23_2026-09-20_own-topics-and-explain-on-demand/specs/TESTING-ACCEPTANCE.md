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
| T232-15 | **Bản sinh thừa một điểm ngữ pháp vẫn dùng được** (lỗi thật, đo 2026-09-20) | như trên | unit |
| T232-16 | Model hào phóng hơn 8 từ thì giữ 8 từ đầu | như trên | unit |
| T232-17 | **Nhãn ngữ pháp dài hơn một từ vựng vẫn hợp lệ** (`MAX_GRAMMAR_TERM`) | như trên | unit |
| T232-18 | Mục dài quá cả cap ngữ pháp bị **bỏ cả mục**, không bị xén | như trên | unit |
| T232-19 | Mục không phải chuỗi dùng được (rỗng, `null`, số) bị loại | như trên | unit |
| T232-20 | **Quá ít** mục thì vẫn trượt — sàn không cắt được | như trên | unit |
| T232-21 | Chuỗi học viên đọc **không bị đụng tới**, dài quá thì vẫn trượt | như trên | unit |
| T232-22 | Bản sinh đúng chuẩn đi qua nguyên vẹn; đầu vào không phải object không làm ném lỗi | như trên | unit |
| T232-L1 | **AI THẬT**: viết chủ đề từ một câu tiếng Việt, vào vai được nó, chấm đúng lỗi, `voiceScript` chỉ có `NPC/en` | `live-scenario-authoring.test.ts` | live, opt-in |
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
| `npx vitest run` | 138 file / 921 test | **140 file (139 chạy + 1 skipped) / 949 test (948 + 1 skipped)** |
| `npm run build` | PASS | **PASS**, có 2 route scenario |
| `npx playwright test` | 50/50 | **53/53** |

### Bằng chứng khác biệt thật

1. **Reasoning không còn tự phát.** `e2e/learning-regressions.spec.ts` trước đây khẳng định lời Coach **hiện ngay** sau khi chấm — và nó **đỏ** sau thay đổi này. Test nay khẳng định điều ngược lại: không hiện, bấm `Giải nghĩa` mới hiện, và lặp lại sau khi tải lại trang. Một test phải đổi chiều là bằng chứng hành vi đã thật sự đổi.
2. **Chủ đề là dữ liệu.** E2E tạo chủ đề bằng cách ghi thẳng vào bảng rồi vào vai được nó — không sửa một dòng mã nào. Trước Plan23 điều đó bất khả thi vì khoá là union type.
3. **Ranh giới quyền sở hữu.** Cùng một E2E chứng minh khoá `custom-<id>` của người khác trả `404` khi vào vai, dù nó **đúng dạng** và qua được rào kiểm hình dạng.

## 3. Đường AI thật: đã chạy, và nó đỏ ngay lần đầu

E2E vẫn **gieo sẵn** chủ đề thay vì gọi AI thật, để một lượt chạy suite không tốn lượt AI và không phụ thuộc gateway. Khoảng trống đó được bịt bằng **một test live riêng, opt-in**:

```
set -a && . ./.env && set +a
LISTENAI_LIVE_AI_PROBE=1 npx vitest run --disableConsoleIntercept src/server/learning/live-scenario-authoring.test.ts
```

Phải có **cả** provider cấu hình đúng **và** `LISTENAI_LIVE_AI_PROBE=1`; thiếu một trong hai thì test tự `skip`, nên nó **không bao giờ** nằm trong một lượt gate. Lý do tách ra: nó tốn lượt AI thật và thừa hưởng độ phập phù của gateway, mà một test phập phù trong cổng kiểm sẽ dạy mọi người quen với màu đỏ. Nó dựng một SQLite tạm trong thư mục temp của hệ điều hành và xoá sau khi xong; `prisma/dev.db` không bị mở.

**Lần chạy đầu tiên bắt được lỗi thật ngay** (chi tiết trong nhật ký quyết định của [`plan.md`](../plan.md), mục 10:20–11:40): một bản sinh thừa một điểm ngữ pháp, hoặc một nhãn ngữ pháp dài hơn mức một từ vựng cần, làm cả bản sinh bị `parse` ném đi và học viên nhận `503`. Đo được **2/15** lượt gọi thật rơi vào đó. Đã sửa bằng `clampGeneratedScenarioLists()` + `MAX_GRAMMAR_TERM`, ghim bằng T232-15…22.

**Bằng chứng lượt chạy xanh** (2026-09-20 01:14): chủ đề viết xong trong 5.3s; từ hay sai đã gieo (`check in`) có mặt cả trong `targetVocabulary` lẫn câu mở đầu; vào vai được khoá `custom-<uuid>`; máy chủ chấm bắt đúng lỗi `tense` đã cài; `voiceScript` chỉ có `["NPC/en","NPC/en","NPC/en"]` — **SPEC-P231 được chứng minh trên đầu ra của model thật**, không phải của stub.

**ĐÃ CHẠY TRÊN PRODUCTION 2026-09-20 12:30** (deploy `listena-lyc7k1jj8`, tài khoản thật `lê ý`):

| Bước | Kết quả |
|---|---|
| `POST /api/learner/mission-scenarios` | **201 trong 12s** — chủ đề `Online Game Teammate`, `summaryVi` tiếng Việt, từ cần nói: strategy/move/coordinate/plan/attack/defend/ready/teamwork |
| `POST /api/learning-sessions` MISSION trên `custom-5db0beaf…` | **201 trong 15s**, lượt mở đầu `voiceScript ["NPC/en","NPC/en"]` |
| `POST …/turns` (câu cài lỗi quá khứ) | **201 trong 103s** — npcReply nằm **trong tình huống học viên tự đặt** và dùng chính từ của nó; `detectedError.type = "tense"`; score 0.5 |
| `voiceScript` lượt chấm | **`["NPC/en","NPC/en","NPC/en"]`** — không dòng COACH nào |

⇒ SPEC-P231 và SPEC-P232 được chứng minh **trên production**, không phải trên stub.

**Hai phát hiện mới, ngoài phạm vi Plan23** (ghi ở `brain4agent/memory/hot/today.md` mục 12:10–12:40): đường **lượt chấm** trên production chỉ **1/4 lần thành công** (3 lần `524` ở 125–130s), và **một lần `schema_validation_failed`** — đầu ra lượt chấm của model trượt `TutorTurnOutputSchema`, cùng họ lỗi vừa sửa ở đây nhưng trên đường chính. Cả hai cần quyết định của user, **chưa sửa**.

## 4. Exit Gates

| Gate | Trạng thái |
|---|---|
| 5 gate local xanh | ✅ local / ⬜ server |
| Migration cộng thêm, `dev.db` không bị áp | ✅ local |
| Migration áp lên production + integrity | ✅ server (33/65 → 34/66, integrity ok, 0 fk) |
| Deploy sau migration | ✅ server (`listena-mpb3rwmfn`, 2026-09-20 09:50) |
| **Tạo một chủ đề bằng AI thật và vào vai nó** | ✅ local (01:14) / ✅ **server** (production, tài khoản thật, 12:30) |
| **Deploy lại kèm bản sửa `clampGeneratedScenarioLists`** | ✅ server (`listena-lyc7k1jj8`, commit `9b37073`) |
