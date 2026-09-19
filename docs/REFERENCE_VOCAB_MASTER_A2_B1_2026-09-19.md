# Tham khảo chức năng: "English Vocab Master A2-B1" (AI Studio app) — 2026-09-19

Mục đích: user yêu cầu "tham khảo thêm các chức năng" của app tại https://english-vocab-master-a2-b1.ai.studio (bản deploy) và link editor AI Studio `apps/8af2415c-97d8-4477-ac8d-36b934617b9d`. Tài liệu này ghi **chức năng thật quan sát được**, đối chiếu với ListenAI và đề xuất phần đáng lấy. **Không có thay đổi mã nào đi kèm tài liệu này**; mọi tính năng muốn làm phải mở plan MINOR có bộ SPEC.

## 1. Phương pháp và giới hạn bằng chứng

| Nguồn | Kết quả |
|---|---|
| `curl` trang chủ + meta description | "Interactive English vocabulary self-study app (A2-B1) with Learn, Practice, Play, Listen, Test modules, Study History, and Random Review with Firebase Auth and Firestore." |
| Bundle `assets/index-CRN8cyaB.js` (892 KB, Vite/React, minified) | Trích chuỗi UI tiếng Việt, dữ liệu từ vựng, logic tiến độ, TTS. Đây là nguồn chính của bảng dưới. |
| Trình duyệt (ego-browser, Tabbit) | Không chạy được trên máy này (ego-browser chưa cài; Tabbit exit 69 = browser chưa mở) → **không có ảnh chụp UI**. |
| Link editor AI Studio | Redirect `accounts.google.com` — cần phiên Google của user, agent không đọc được. Bản deploy là cùng app (cùng id `8af2415c`), nên phần chức năng đã được phủ; phần **prompt/mã nguồn trong editor chưa xem**. |

Kết luận kỹ thuật quan trọng: app **không gọi Gemini hay bất kỳ LLM nào** (không có `generateContent`, `generativelanguage`, `gemini-*` trong bundle). Nội dung là 50 từ viết sẵn; "AI" chỉ ở tên nền tảng.

## 2. Chức năng quan sát được

### 2.1 Nội dung
- 5 bài (Lesson 1→5), nhãn cấp độ A2, mỗi bài 10 từ, tổng **50 từ** (đếm `term:` trong bundle).
- Chủ đề: Daily Life & Routines (Đời sống & Thói quen hàng ngày); Work & Careers (Công việc & Nghề nghiệp); Travel & Holidays (Du lịch & Nghỉ dưỡng); Food & Restaurants (Ẩm thực & Nhà hàng); Technology & Social Media (Công nghệ & Mạng xã hội).
- Schema từ: `{ id, term, ipa, partOfSpeech, meaningEn, meaningVi, exampleEn, exampleVi, collocations: string[] }` — ví dụ `commute` có 3 collocation (`daily commute`, `commute by train`, `long commute`).
- Schema bài: `{ id, lessonNumber, title, titleVi, description, level, iconName, color, accentBg, words[] }`.

### 2.2 Vòng học 5 bước tuần tự cho mỗi bài
`learn → practice → play → listen → test`. Bước tiếp theo tự chọn = bước đầu tiên chưa hoàn thành; `progressPercent = round(completedStages/5×100)`; `isCompleted` khi đủ 5. Nút "Tiếp tục bài học" / "Bắt đầu học mới" / "Ôn tập lại bài".

| Bước | Tên trong app | Cơ chế |
|---|---|---|
| 1 | Học từ vựng (Learn) — "Thẻ học tương tác (Flashcard)" | Thẻ: term, IPA, từ loại, nghĩa EN/VI, ví dụ EN/VI, collocations; nút "Nghe phát âm"; "Từ tiếp theo". |
| 2 | Luyện tập (Practice) — "Bài tập vận dụng từ vựng" | Câu hỏi xoay vòng theo `index % 3`: (0) `fill_blank` điền từ vào câu ví dụ; (1) chọn nghĩa VI đúng của term (kèm IPA); (2) chọn term EN cho nghĩa VI. 4 lựa chọn, nhiễu lấy ngẫu nhiên từ từ khác. Nút "Nghe từ" mỗi câu, thanh tiến độ, đếm "Đúng", ghi kết quả từng từ. |
| 3 | Trò chơi tương tác (Play) — "Nối từ tốc độ (Match)" | Ghép cặp term↔nghĩa; **combo** ("Combo x{n}!") khi đúng liên tiếp; "Điểm tích lũy: N điểm"; hoàn thành → "Chuyển sang Bước 4: Luyện nghe". |
| 4 | Luyện nghe (Listen) — "Nghe & Chép chính tả (Audio Dictation)" | "Nhấn loa để nghe từ vựng và gõ lại bên dưới"; so khớp chính xác không phân biệt hoa thường; ba tốc độ: **Nghe chậm 0.75x / Phát âm 1.0x / Nghe nhanh 1.2x**; "Nghe lại"; "Nghe câu" (ví dụ). |
| 5 | Bài kiểm tra (Test) — "Kiểm tra đánh giá cuối bài" | Đạt → "Xuất sắc! Bạn đã vượt qua bài kiểm tra và hoàn thành bài học!"; không đạt → "Hãy xem lại các từ chưa đúng và thử lại"; lặp "cho đến khi tỷ lệ đúng đạt 100%". Kết quả lưu vào lịch sử. |

### 2.3 Theo dõi và ôn tập
- **Thống kê tổng quan** (header): tiến độ chung, số bài hoàn thành, số "từ hay sai". Người dùng: `{ totalScore, completedLessons, createdAt, updatedAt }`.
- **Lịch sử học & Từ hay sai**: lịch sử bài kiểm tra; thống kê theo từ `{ correctCount, wrongCount }`; "thuộc" = `correctCount ≥ 2 && wrongCount == 0`; "hay sai" = `wrongCount > 0`; thông điệp "Hệ thống tự động phân tích tần suất trả lời sai để gợi ý bài tập khắc phục" — trên thực tế chỉ là **danh sách từ sai**, không có sinh bài tập.
- **Random Review (Ôn tập ngẫu nhiên)**: gom từ ngẫu nhiên từ mọi bài (nhóm), "Ôn tập lại nhóm từ khác", "Hoàn thành phiên Ôn tập!".

### 2.4 Nền tảng
- Firebase Auth (đăng nhập Google) + Firestore (`getLessonProgress`, `getStudySessions`, `getWordStats`, `syncUserProfile`); **không đăng nhập vẫn dùng được** với `userId = local-user` và `localStorage`.
- Giọng: `speechSynthesis` trình duyệt, `lang en-US`, `rate` kẹp 0.6–1.4, ưu tiên voice có tên chứa "Natural"/"Google". Âm hiệu đúng/sai bằng WebAudio oscillator (sine/triangle), không cần file.
- Toàn bộ chấm điểm ở **client**.

## 3. Đối chiếu với ListenAI (0.7.0, kernel 2026-09-19)

| Chức năng app tham khảo | ListenAI đã có | Khoảng trống / đáng lấy |
|---|---|---|
| 50 từ, 5 chủ đề, collocations + exampleVi | 116 vocabulary, 5 lessons, 54 exercises, 20 segments | Kiểm `VocabularyItem` có collocations/exampleVi chưa (chưa kiểm trong lượt này). Đáng lấy: **collocations trên thẻ từ**. |
| Vòng 5 bước tuần tự + % theo bài + tự nhảy bước dở | Lesson có Nghe/quiz/dictation nhưng không có "hành trình bước" hiển thị | Đáng lấy như **khung remediation lesson** (Learn→Practice→Play→Listen→Test) — phù hợp product direction (lesson hỗ trợ remediation, không thay Mission). |
| Practice 3 dạng xoay vòng, nhiễu ngẫu nhiên | Answer Canvas (FREE/SKELETON/TILES/CONFIDENCE/PREDICT), server grading | Không cần; ListenAI mạnh hơn. |
| Match + combo + điểm tích lũy | Game Ghép cặp (server-authoritative, cooldown 10 s) | Đáng lấy phần **combo/điểm tích lũy** nếu giữ chấm ở server (điểm do server tính). |
| Dictation 0.75×/1.0×/1.2× | Nghe & viết + ElevenLabs `speed` 0.7–1.2 + cài đặt tốc độ toàn cục | Đáng lấy: **ba nút tốc độ ngay tại bài Nghe & viết** (không chỉ trong Settings). |
| Test cuối bài chặn hoàn thành, lặp tới 100% | Completion theo evidence, PARTIAL vs COMPLETED | Cân nhắc **gate "kiểm tra cuối bài"** cho remediation lesson; phải ghi qua evidence server, không copy logic client. |
| Từ hay sai (wrongCount) + Random Review | VocabularyMastery, SM-2 due, LearningEvidence | Đáng lấy: **màn "Từ hay sai cần ôn"** từ evidence hiện có + **Ôn tập ngẫu nhiên xuyên bài** (pool từ theo mastery thấp), không thay SM-2. |
| Âm hiệu WebAudio đúng/sai | Chưa rõ | Rẻ, không asset; cân nhắc trong game. |
| Không đăng nhập vẫn học, Firestore sync | Bắt buộc xác minh email (Plan09), server-owned evidence | **Vùng cấm**: không làm chế độ local-user/không đăng nhập; không đưa chấm điểm về client. |
| Google sign-in | Chưa có | Ngoài phạm vi; Plan09 mail còn mở trước. |

## 4. Đề xuất (chỉ đề xuất — chưa quyết)
1. Plan MINOR "Lesson journey + Từ hay sai + Random Review" với bộ SPEC: khung 5 bước cho remediation lesson; màn "Từ hay sai" và "Ôn tập ngẫu nhiên" xây trên `VocabularyMastery`/`LearningEvidence` hiện có; tốc độ 0.75/1.0/1.2 tại Nghe & viết; combo/điểm ở game do server tính. Vùng cấm: chấm điểm client, bỏ đăng nhập, Firebase.
2. Trước đó: user mở link editor AI Studio và dán phần **prompt/mã** nếu muốn agent so sánh cách sinh nội dung (app deploy không dùng LLM nên có thể editor cũng không có).
3. Ưu tiên vẫn là Plan16 WP2/WP4/WP5 (key ElevenLabs thật, chi phí, bump 0.8.0) và rào cản mail production (chưa ai đăng nhập được).
