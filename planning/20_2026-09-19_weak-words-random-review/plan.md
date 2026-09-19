# Kế hoạch 20 — Từ hay sai, Ôn tập ngẫu nhiên, và ba tốc độ nghe

## Metadata Header

| Trường | Giá trị |
|---|---|
| Mã kế hoạch | 20_2026-09-19_weak-words-random-review |
| Loại | MINOR (SemVer) — đủ bộ SPEC theo luật §2 |
| Phiên bản dự án | 0.7.0 (bump là quyết định của user) |
| Ngày mở | 2026-09-19 |
| Trạng thái | LOCAL ACCEPTED — 5/5 gate xanh, E2E 43/43 ba lượt liên tiếp |
| Nguồn yêu cầu | User chọn "Tính năng Vocab Master" (2026-09-19), theo đề xuất §4 của [`docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md`](../../docs/REFERENCE_VOCAB_MASTER_A2_B1_2026-09-19.md) |
| Ràng buộc user | **"làm gì cũng được nhưng không được thay đổi db"** (2026-09-19) |

## Bảng trỏ SPEC

| File | Nội dung |
|---|---|
| [`specs/00-ARCHITECTURE.md`](specs/00-ARCHITECTURE.md) | Mục tiêu, non-goals, 6 bất biến, thứ tự đọc |
| [`specs/01-CONTRACTS.md`](specs/01-CONTRACTS.md) | Kiểu, chữ ký hàm, endpoint, bảng lỗi + hành vi caller |
| [`specs/SPEC-P201-weak-words-core.md`](specs/SPEC-P201-weak-words-core.md) | Phân loại, xếp hạng, bốc nhóm ngẫu nhiên |
| [`specs/SPEC-P202-vocabulary-page.md`](specs/SPEC-P202-vocabulary-page.md) | Trang `/learner/vocabulary` |
| [`specs/SPEC-P203-dictation-speeds.md`](specs/SPEC-P203-dictation-speeds.md) | Ba tốc độ nghe tại vòng chính tả |
| [`specs/OPERATIONS.md`](specs/OPERATIONS.md) | Thứ tự triển khai, rollback, giám sát |
| [`specs/TESTING-ACCEPTANCE.md`](specs/TESTING-ACCEPTANCE.md) | 21 ca test + bằng chứng + Exit Gates |

## Nhật ký quyết định

### 2026-09-19 20:50 — Cắt phạm vi theo ràng buộc "không được thay đổi db"

Đề xuất trong tài liệu tham khảo có 5 mảng. Đối chiếu với schema thật (`prisma/schema.prisma`) cho ra hai nhóm rõ ràng:

| Mảng | Cần schema mới? | Quyết định |
|---|---|---|
| Từ hay sai | **Không** — `VocabularyMastery` đã có `correctCount`, `incorrectCount`, `masteryScore`, `nextReviewAt` | Làm |
| Ôn tập ngẫu nhiên | **Không** — cùng bảng đó | Làm |
| Ba tốc độ nghe tại Nghe & viết | **Không** — thuần client | Làm |
| Vòng học 5 bước `learn→practice→play→listen→test` | **Có** — phải lưu bước nào đã xong, theo từng bài từng học viên | Hoãn, chờ user duyệt migration |
| Combo / điểm tích luỹ do máy chủ tính | **Có** — chuỗi đúng liên tiếp phải sống qua các lượt | Hoãn, cùng lý do |

Ba mảng đầu là một lát cắt **hoàn chỉnh và tự đứng được**: học viên thấy từ mình hay sai, ôn lại một nhóm ngẫu nhiên, và nghe chậm được ngay tại chỗ luyện chính tả. Không phải mảnh vụn của một tính năng dở dang.

### 2026-09-19 20:55 — Khác biệt cố ý với app tham khảo: chấm điểm ở đâu

App tham khảo chấm ở **client** và ghi `wrongCount` từ chính màn tự kiểm tra. ListenAI không được phép: mọi chấm điểm và mọi ghi mastery thuộc máy chủ.

Hệ quả thiết kế: nút "Xem nghĩa" ở nhóm ôn ngẫu nhiên **không phải một câu trả lời**. Nó không gọi API, không tính đúng/sai, không đổi mastery. Trang hiển thị điều máy chủ đã biết và dẫn học viên về một mặt **có chấm điểm** (Ôn từ, Trò chơi, Mission) để con số thay đổi.

Đây là vùng cấm, không phải thiếu sót. Ai đọc sau đừng "hoàn thiện" bằng cách cho trang này ghi điểm.

### 2026-09-19 21:10 — Chọn từ ở máy chủ, và vì sao nhóm ngẫu nhiên không được lọc cứng

Cả hai danh sách do máy chủ quyết định; client không gửi seed, không gửi bộ lọc.

Với nhóm ngẫu nhiên, cám dỗ là chỉ lấy từ có `masteryScore` thấp nhất. **Đã loại**: làm thế thì nó chỉ là danh sách "hay sai" dưới một cái tên khác, và học viên mất cơ hội phát hiện một từ mình tưởng đã thuộc nhưng thật ra không. Công thức `random() * (0.5 + masteryScore)` nghiêng về từ yếu mà vẫn để từ chắc lọt vào — đã ghim bằng test T201-09.

### 2026-09-19 21:40 — Quyết định bị thay thế: nguyên nhân thật của flake `timeline.spec.ts`

**Thay thế chẩn đoán trong Plan19 (19:05)** cho riêng ca `timeline.spec.ts:27`. Plan19 quy mọi flake điều hướng về việc `next dev` biên dịch route theo yêu cầu. Chẩn đoán đó **đúng cho các ca kia**, nhưng sai cho ca này: sau khi Plan19 chuyển E2E sang bản build, `timeline.spec.ts:27` vẫn fail.

Lần này đọc được thông điệp thật: `DatabaseUnavailableError`. Truy ngược `src/lib/database-errors.ts` cho thấy nó là ánh xạ của `SQLITE_BUSY` / "database is locked". Nguyên nhân: tiến trình Playwright và tiến trình server **cùng ghi một file SQLite**; ở chế độ journal mặc định, một lượt ghi khoá cả database nên bên thua nhận `SQLITE_BUSY` ngay lập tức.

**Sửa:** `e2e/setup.ts` đặt `PRAGMA journal_mode=WAL` cho database tạm. Đã kiểm bằng probe rằng WAL **bám vào file** và kết nối mới đọc được, nên cả hai tiến trình đều hưởng. Setup **ném lỗi** nếu pragma không trả về `wal` — chạy E2E ở journal cũ là chạy trên nền không tin được.

**Vùng cấm:** không áp WAL cho `prisma/dev.db` hay Turso. Hàm setup đã tự chối chạy ngoài thư mục tạm cách ly; pragma nằm sau rào đó.

**Đo thật:** flake này fail khoảng 1 lượt trong 3 kể từ 2026-09-17. Sau khi đặt WAL: **43/43 ba lượt liên tiếp**.

## Work Packages

| WP | Nội dung | Model Tier | Trạng thái |
|---|---|---|---|
| WP1 | Lõi `weak-words.ts` + 11 unit test | root | ✅ |
| WP2 | Route `GET /api/learner/vocabulary-review` + 6 unit test | root | ✅ |
| WP3 | Trang `/learner/vocabulary` + mục nav | root | ✅ |
| WP4 | Ba tốc độ nghe tại vòng chính tả | root | ✅ |
| WP5 | E2E: 3 ca cho trang, 1 ca cho tốc độ | root | ✅ |
| WP6 | WAL cho database E2E + đo 3 lượt | root | ✅ |
| WP7 | Bộ SPEC + đồng bộ não | root | ✅ |
| WP8 | Deploy production + nghiệm thu | root | ⬜ |

## Checklist thực thi

- [x] Đối chiếu đề xuất với schema thật để biết mảng nào cần migration
- [x] Lõi thuần, `now` và `random` là tham số
- [x] Route chỉ đọc, phạm vi chủ sở hữu, đi qua `databaseErrorResponse`
- [x] Trang hai mục + ba ô đếm + CTA về mặt có chấm điểm
- [x] `HiddenAudioButton` nhận `rate`, đổi tốc độ thì phát lại, không request mới
- [x] E2E chứng minh từ của học viên khác không rò ra
- [x] Chẩn đoán và sửa flake `timeline.spec.ts` bằng nguyên nhân thật
- [x] 5 gate local
- [ ] Deploy production và nghiệm thu route mới
- [ ] Hỏi user về migration cho vòng 5 bước và combo

## Exit Gates

| Gate | Kết quả | Môi trường |
|---|---|---|
| `npm run type-check` | 0 lỗi | ✅ local / ⬜ server |
| `npx eslint .` | 0 lỗi / 0 cảnh báo | ✅ local / ⬜ server |
| `npx vitest run` | **131 file / 840 test** (trước: 129/823) | ✅ local / ⬜ server |
| `npm run build` | PASS, có 2 route mới | ✅ local / ⬜ server |
| `npx playwright test` | **43/43**, ba lượt liên tiếp | ✅ local / ⬜ server |
| Nghiệm thu production | chưa chạy | ⬜ server |
| Học viên thật dùng được trên production | **chặn bởi `NEXTAUTH_URL`** (Plan19) | ⬜ server |

## Việc còn mở

- **Cần user quyết:** có cho phép migration để làm vòng học 5 bước và combo do máy chủ tính không.
- `NEXTAUTH_URL` production (Plan19) — vẫn chặn mọi nghiệm thu bằng người thật.
- 3 biến trùng ở Preview — cùng rào cản quyền ghi env.
