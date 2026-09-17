# ListenAI

Ứng dụng tự học tiếng Anh AI-native cho người Việt. Mission, Lesson Coach và Daily Quest dẫn dắt vòng học: trả lời → phản hồi → sửa lỗi → evidence → mastery/memory → hoạt động tiếp theo. Bài học, trò chơi từ vựng và flashcards hỗ trợ luyện tập.

## Kiến trúc

Next.js 16.3.5 App Router, React 19, TypeScript, Auth.js Credentials/JWT, Prisma 6 và SQLite (local/test) hoặc Turso/libSQL (hosted). Tutor dùng Vyce AI (Chat Completions, OpenAI-compatible) hoặc OpenAI Responses; server giữ validator, điểm, trạng thái và evidence.

- Session/turn/intervention được lưu để tải lại hội thoại. `clientTurnId` chống ghi trùng.
- Evidence, mastery và learner memory ghi trong cùng transaction. Memory có kiểu dữ liệu được kiểm tra và chỉ bản tóm tắt giới hạn được đưa vào ngữ cảnh tutor.
- Session hoàn tất có đề xuất tiếp theo trong phản hồi API; giao diện mở Coach, Mission, Quest hoặc Mission luyện sửa lỗi có mục tiêu.
- Dashboard/progress dùng timeline gồm phiên AI, evidence, bài luyện và lượt ôn thẻ. Tổng phút tuần tính từ toàn bộ phiên hoàn tất trong bảy ngày, độc lập với giới hạn 50 mục hiển thị.

Chi tiết: [Learning runtime](docs/learning.md), [AI architecture](docs/AI_FIRST_ARCHITECTURE.md), [Plan 03 và nghiệm thu](planning/03_2026-09-08_learning-loop-completion/plan.md).

## Chạy local

Dùng Node.js theo `.nvmrc` (Node 24). Sao chép `.env.example` thành `.env`, đặt `DATABASE_URL` tới SQLite local và cấu hình auth secret.

```bash
npm install
```

Chỉ với database demo mới: `npm run db:push`, `npm run db:seed`, rồi `npm run dataset:import`. Seed xóa dữ liệu hiện có; không chạy trên database có tiến độ người học. Với database đang dùng, áp dụng migrations phù hợp sau khi sao lưu (`dev.db.bak`).

```bash
npm run dev
```

Mở `http://localhost:3000`. Database demo có `learner@example.com` và `teacher@example.com`, mật khẩu `demo1234`.

## Dataset và hoạt động học

Dataset gồm 5 unit, 116 từ vựng, 10 chủ điểm ngữ pháp, 54 bộ bài tập và 200 knowledge chunks. `npm run dataset:import` nhập idempotent. Nội dung Educaplay tham khảo giữ DRAFT, không thuộc curriculum học viên.

Game Hub ưu tiên Mission và Daily Quest; Quick comeback gồm chọn nhanh, ghép cặp, nghe và viết. Curriculum dựa vào trạng thái PUBLISHED, không phụ thuộc tên khóa học.

## Answer Canvas (Plan13)

Từ Plan13 (SPEC-P133), các bài điền đáp án không còn là `textarea + Kiểm tra`. Answer Canvas là một client component (`src/features/answer-canvas/`) có ba chế độ và một bước cược tự tin; server vẫn giữ đáp án và chấm điểm, client chỉ nhận **mức trợ giúp đã trả giá**:

- **Gõ tự do (FREE):** băng chữ cuộn ngang, mỗi từ là một chip có thể xoá/chèn.
- **Viết dần (SKELETON, giá 1 hint):** server trả khung độ dài từng từ và chữ cái đầu của tối đa 1/3 số từ (chọn theo seed), học viên điền như giải ô chữ.
- **Ghép mảnh (TILES, giá 2 hint):** server trả các từ của đáp án đã xáo trộn cộng 2 từ nhiễu lấy từ bài; học viên xếp thành câu và có thể nghe lại bằng Web Speech.
- **Cược tự tin:** chọn 1–3 sao trước khi nộp; trang kết quả hiện calibration (đúng-chắc, đúng-không chắc, sai-chắc, sai-không chắc). Lưu `Attempt.confidence` và `Attempt.assistMode`.
- **Nghe-đoán trước:** với bài có audio, ẩn nút nghe 20 giây để học viên đoán từ ngữ cảnh rồi nghe và sửa.

Trợ giúp đi qua `POST /api/attempt/assist` (bài legacy) và `POST /api/learner/personalized-lessons/{id}/assist` (bài AI riêng, `FILL`/`SPELL`) với body `{ exerciseId, lessonId, clientAttemptId, mode }`; kết quả xác định theo `seed = sha256(clientAttemptId + mode)` nên gọi lại không tốn thêm hint. Mọi chế độ nộp cùng một `submittedAnswer` qua `POST /api/attempt`, `hintCount` bằng tổng `hintCost` đã dùng. Không chế độ nào trả toàn bộ đáp án đúng thứ tự trước khi nộp; không dùng STT/microphone; không lưu trạng thái assist vào localStorage.

## AI provider

Provider chính là Vyce AI (Chat Completions, chỉ chấp nhận đúng endpoint `https://vyceai.com/v1`); OpenAI (Responses) là lựa chọn thay thế. Provider Kira và các biến `KIRAAI_*` đã bị gỡ ngày 2026-09-17 và bị từ chối nếu còn cấu hình. Không có provider mock trong runtime. Khi provider chưa cấu hình hoặc gặp sự cố, server trả về phản hồi lỗi typed/unavailable tường minh (hoặc mẫu nhiệm vụ xác định cho mission):

```env
AI_PROVIDER=vyce
VYCE_API_KEY=...
VYCE_MODEL=claude-sonnet-4-6
VYCE_BASE_URL=https://vyceai.com/v1
```

Hoặc OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Sinh bài AI riêng bất đồng bộ (Plan13)

Đo thực tế 2026-09-17: gateway trả 524 ở ~125 s cho đầu ra ~2.200 token, trong khi ~1.200 token về sau 7–10 s. Plan13 (SPEC-P131) vì thế rút gọn đầu ra và chuyển việc sinh bài sang bất đồng bộ:

- **Prompt gọn:** 4–5 từ vựng, đúng 4 bài tập, transcript ≤ 700 ký tự, `maxOutputTokens` 1.400 (cấm tăng hoặc quay lại đồng bộ).
- **202 + poll:** `POST /api/learner/personalized-lessons` claim một row `GENERATING` (`generationStartedAt`, `generationAttempt`), đặt chỗ ngân sách AI rồi trả **202** `{ lesson: { id, status: "GENERATING" }, retryAfterSeconds: 3 }`; việc gọi provider chạy sau phản hồi (`after()` của Next). `GET /api/learner/personalized-lessons/{id}` trả `{ lesson: { id, status, failureCode? } }` cho `GENERATING`/`FAILED` và nội dung bài khi `READY`. Client poll mỗi 3 s tối đa 210 s, hiện tiến trình; `FAILED` có nút "Thử lại".
- **Lease dài hơn call dài nhất:** đặt chỗ AI và start-request có `leaseExpiresAt = now + 210 s`; mọi đường lỗi sau khi đặt chỗ đều settle. Provider timeout 180 s và `maxDuration` 200 giữ nguyên.
- **Lỗi có kiểu:** `AI_MISCONFIGURED` (không retry), `AI_RATE_LIMITED` (503 + `Retry-After`), `AI_UNAVAILABLE` (retry); trạng thái `UNKNOWN` chỉ dành cho lỗi sau khi provider đã trả về.
- **Thoát kẹt phiên AI:** `POST /api/learning-sessions/{id}/abandon` (idempotent) và `replaceActive: true` khi tạo phiên; phiên rỗng quá 2 phút được tự huỷ thay vì 409 `ACTIVE_SESSION_EXISTS`.

Kịch bản vận hành khi gặp 524: [docs/RUNBOOK_INCIDENT.md](docs/RUNBOOK_INCIDENT.md) mục 5.

## Đăng nhập: throttle và chống dò tài khoản (Plan13)

Theo SPEC-P130, bảng `AuthAttempt` (migration `20260917230100_plan13_auth_throttle`) đếm thất bại theo `sha256(email)` và `sha256(ip)` (`x-forwarded-for` đầu tiên hoặc `x-real-ip`, thiếu → `"unknown"`): tối đa **5** lần sai / 10 phút theo email và **20** / 10 phút theo IP, khoá **15 phút** (`lockedUntil`), cập nhật bằng một câu `INSERT ... ON CONFLICT DO UPDATE`. Khi bị khoá, `authorize()` ném `CredentialsSignin` mã `auth_locked` và giao diện chỉ nói "Đăng nhập tạm khoá, thử lại sau vài phút" — cùng thông điệp dù tài khoản có tồn tại hay không. Đăng nhập thành công xoá row email; lỗi DB trong throttle fail-open (không khoá oan) nhưng được log.

Các route quên mật khẩu / gửi lại xác minh / đăng ký luôn trả **202** cùng thân phản hồi, pad thời gian tới ≥ 400 ms và gửi mail sau phản hồi, để không lộ tài khoản qua status, thân hay thời gian. JWT re-read `role`/`emailVerifiedAt` từ DB tối đa mỗi 5 phút; TEACHER bị 403 `ROLE_FORBIDDEN` trên API học viên.

## Giọng đọc và Voice AI

Tiếng Anh dùng Web Speech API phía trình duyệt và giọng hệ thống, chọn theo **chính sách giọng** (Plan14, [ADR 0002](docs/adr/0002-voice-ai.md)): giọng neural > premium > hệ thống > Google (dự phòng); giọng novelty bị loại; accent do học viên chọn (`en-US` mặc định, `en-GB`). Thư viện Kokoro đã được loại bỏ hoàn toàn khỏi dự án.

Voice AI (chạy nguyên trên Vercel, không biến môi trường mới):

- **Văn bản nói chuẩn:** mọi chuỗi vào giọng đi qua `prepareSpokenText` (`speakCurated`): sạch markdown/emoji/IPA/URL, tách câu, viết hoa + dấu kết câu, mở rộng viết tắt, tách dòng tiếng Việt/tiếng Anh.
- **Kịch bản lượt AI do server dựng:** mỗi AI turn trong `/api/learning-sessions/*` có `voiceScript` (NPC tiếng Anh, RECAST = câu đã sửa đọc chậm, COACH tiếng Việt). Câu sai của học viên không bao giờ được đọc.
- **Nói để trả lời:** nút mic trong Session Player dùng recogniser của trình duyệt (Chrome/Edge/Safari); audio không rời trình duyệt qua mã của ứng dụng. Firefox giữ đường gõ.
- **Luyện nói:** "Nghe mẫu / Nói lại" trên từng câu NPC; `POST /api/voice/pronunciation` chấm mức từ trên server (đồng âm tính đúng), verdict GOOD/ALMOST/RETRY; có `sessionId` thì câu phải thuộc phiên và điểm ghi vào sổ sự kiện phiên (`VOICE_PRACTICE`), không ghi mastery.
- Cài đặt giọng (accent, tốc độ, tự đọc, đọc coach) lưu trong trình duyệt (`listena.voice.v1`).

Giọng AI ElevenLabs (Plan15, [ADR 0003](docs/adr/0003-elevenlabs-voice.md), tuỳ chọn):

- Đặt `ELEVENLABS_API_KEY` (và tuỳ chọn `ELEVENLABS_MODEL_EN/VI`, `ELEVENLABS_VOICE_EN_US/EN_GB/VI`) → server tổng hợp giọng qua `POST /api/voice/tts`; không key thì mọi thứ chạy bằng giọng trình duyệt như cũ.
- Không hard-code voice ID: server xếp hạng giọng premade của chính tài khoản theo chính sách chọn lọc (Talia, Elara, Alicia, Finley, Eldrin… và các giọng Default cũ nếu tài khoản còn); `npm run voice:doctor -- --probe` in bảng xếp hạng và nghe thử.
- Đáp án ẩn (game Nghe & viết, bài riêng Viết chính tả) được đọc bằng route audio server-side, không bao giờ trả text.
- Voice có ở mọi màn hình: game (tự đọc từ, loa trên thẻ, tự phát từ cần viết), bài AI riêng, phiên Mission (tự đọc lượt mở đầu), bài học, flashcards.

Tiếng Việt dùng private VieNeu TTS sidecar (`vieneu==3.3.0`, speed cố định 1.0); khi không khả dụng, speech controller thử Web Speech nếu thiết bị có giọng phù hợp.

- `GET/POST /api/tts/vie` yêu cầu đăng nhập.
- App và sidecar phải có cùng `TTS_API_KEY`. Thiếu cấu hình sẽ từ chối phục vụ (503).
- App dùng `VIENEU_URL` (mặc định `http://localhost:8001`). Có thể để trống `VIENEU_DEFAULT_VOICE` để lấy giọng từ sidecar.
- Next.js audio cache nằm ở `TTS_PROXY_CACHE_DIR` (mặc định `tts-service/cache/proxy`), ngoài `public/`; phản hồi audio dùng `Cache-Control: private, no-store`.
- Sidecar chỉ lắng nghe trên loopback (`127.0.0.1:8001`) và trả về lỗi opaque khi synthesis thất bại.

Chạy sidecar trực tiếp với Python 3.11 trong môi trường shell:

```bash
cd tts-service
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
```

Hoặc `docker compose up tts`. Compose truyền `TTS_API_KEY` và chỉ publish cổng TTS trên loopback (`127.0.0.1:8001`). Sidecar dùng `vieneu==3.3.0`, khởi tạo model lúc startup; chỉ chạy một worker.

## Kiểm tra và CI

```bash
npm test                      # Chạy toàn bộ Vitest unit & integration tests
npm run test:coverage         # Đo độ phủ kiểm thử với v8
npm run type-check            # Kiểm tra kiểu TypeScript
npm run lint                  # Kiểm tra ESLint (0 errors, warnings <= 32)
npx prisma validate           # Xác thực schema Prisma
npm run eval:learning         # Đánh giá chất lượng Socratic & sư phạm (offline / live)
npm run pilot:analyze         # Công cụ phân tích cohort thử nghiệm có consent
npm run test:e2e              # Chạy Playwright E2E trên database SQLite tạm
npm run migration:verify -- --self-test   # Tự kiểm verifier schema trên SQLite tạm (hợp đồng suy từ prisma/migrations)
npx tsx scripts/verify-backup-restore.ts  # Drill backup/restore thật: migrate → seed+import → export JSON → restore → so hash từng bảng
```

E2E dùng database SQLite mới trong thư mục temp, tự chạy migrations/seed/import; không dùng database người học. Không chạy build và E2E đồng thời vì cùng dùng `.next`.

## Hạ tầng, vận hành và phát hành (1.0.0)

- **Mục tiêu triển khai hosted:** Vercel + Turso (libSQL) theo lộ trình Plan 07, 09, 10, 11, 12.
- **Dự phòng & Rollback:** Cloudflare Worker + D1 là phương án rollback lịch sử. Drill backup/restore (`npx tsx scripts/verify-backup-restore.ts`) chạy migration thật + seed + dataset trong thư mục tạm, export JSON, restore và so SHA-256 từng bảng, in số bảng/row thật. Verifier schema (`npm run migration:verify`) suy hợp đồng từ `prisma/migrations/**`. Ghi chú migration không additive và cách quay lui: [docs/PRODUCTION_CUTOVER_RUNBOOK.md](docs/PRODUCTION_CUTOVER_RUNBOOK.md) mục 4.
- **Ứng phó sự cố:** Tham khảo [docs/RUNBOOK_INCIDENT.md](docs/RUNBOOK_INCIDENT.md) cho 5 kịch bản (Database unavailable, AI provider outage, Email delivery outage, Secret leak, AI gateway 524).
- **Đánh giá sư phạm & Pilot:** Tham khảo [eval/LEARNING_EVALUATION.md](eval/LEARNING_EVALUATION.md) và [docs/PILOT_PROGRAM_SPEC.md](docs/PILOT_PROGRAM_SPEC.md).


