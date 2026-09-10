# Gotchas

## Đã xử lý
- HTTPS Auth.js dùng __Secure-authjs.session-token; getToken cần secureCookie và URL precedence đúng. Tests dùng token mã hóa thật/chunked.
- Câu intervention ngắn đúng bị provider coi thiếu chi tiết: normalize theo validator trước DTO/state/evidence/mastery.
- Auto-complete bỏ studyMinutes: shared finalizer trong transaction, retry không cộng đôi.
- correctCount/incorrectCount là delta, phải atomic increment.
- Intervention cần React key=id; flashcard queue không modulo vô hạn.
- Windows Prisma migrate deploy với file DB chưa tồn tại có thể báo Schema engine error rỗng: E2E tạo file rỗng trước migrate.
- Date.now khởi tạo timer trong effect, không render; event callback memoized để qua React lint.
- `complete` không được dùng số turn client để chứng minh học: chỉ learner-owned LearningEvidence mở được partial/success completion và cộng phút.
- Meter profile cũ có thể lệch SkillMastery của AI; learner-facing meter phải qua resolver adaptive-first, không thêm một luồng sync profile mới.
- Daily Quest recency chỉ là lịch sử stateJson đã validate của chính learner; malformed key phải bị bỏ qua và all-recent phải fallback authored deterministic.

## Còn backlog
- Render PostgreSQL không khớp SQLite schema/migration lock; chưa production ready.
- TTS auth/key/loopback boundary đã được Plan03 xử lý. Speed được nhận nhưng infer bỏ qua/cache Python thiếu speed; real voice behavior vẫn chưa verified.
- Legacy attempt/review/game chưa tạo unified LearningEvidence/memory; không tự tạo synthetic session để vá tạm.
- Legacy attempt/review nhiều write chưa cùng transaction; atomic counter không giải quyết toàn bộ concurrent schedule.
- Kokoro scripts/dependencies còn legacy; không tự bật model download.
- Báo cáo lịch sử có số liệu lỗi thời; audit2026-09-07 và acceptance mới được ưu tiên.
- Upstream brain managed rules có path hoang: dùng project binding AGENTS, không sửa tay block. Bản local engine1.7.2, GitHub đã có1.7.3; không tự cập nhật global skills.

- Demo seed tạo course English 1 - Listening and Vocabulary nhưng một số learner page còn lọc TATQHP1 - SOLUTIONS Pre-Intermediate + title Bài ; kết quả trang trống dù DB có dữ liệu. Đã đồng bộ, cần tránh hard-code course/title khi query curriculum.
