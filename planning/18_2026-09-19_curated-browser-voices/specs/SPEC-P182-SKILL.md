# SPEC-P182 — Skill `english-voices`

## 1. Vị trí và hình thức

- Canonical: `.agents/skills/english-voices/SKILL.md` (+ `references/`), theo chuẩn agentskills.io — cùng chỗ với `elevenlabs-voice` (Plan17).
- Shim: `.claude/skills/english-voices/SKILL.md`, **≤ 10 dòng**, chỉ trỏ về bản canonical. **CẤM** nhân bản luật (luật J, AGENTS.md).
- Frontmatter bắt buộc: `name`, `description` (nêu rõ *không cần API key*), `compatibility`, `metadata` trỏ về `planning/18_.../specs/SPEC-P180-CATALOG.md` và ADR.

## 2. Nội dung bắt buộc

| Mục | Nội dung |
|---|---|
| Thứ tự đọc | SKILL.md → `references/voice-catalog.md` → `references/install-voices.md` → SPEC-P180/P181 |
| Luật repo | Chiếu lại C1–C7 (SPEC-P180) và U1–U7 (SPEC-P181) ở dạng ngắn, **trỏ** về spec chứ không chép nguyên |
| Công thức A | "Thêm một giọng vào catalog" — sửa bảng SPEC-P180 §4 → `browser-voice-catalog.ts` → test → 5 gate |
| Công thức B | "Máy học viên nghe dở" — chẩn đoán theo bảng ở §3 dưới |
| Công thức C | "Kiểm giọng trên một máy" — đoạn `speechSynthesis.getVoices()` dán vào console, in tên + lang + localService |
| Khác biệt với `elevenlabs-voice` | Bảng: skill này = giọng miễn phí trên thiết bị, không key, không server; skill kia = giọng AI server-side có key |

## 3. Bảng chẩn đoán bắt buộc có trong skill

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| Giọng như robot, ngắt quãng | Máy chỉ có SAPI cũ (David/Zira/Mark/Hazel/George) | OPERATIONS §1.1 cài giọng Natural, hoặc dùng Edge |
| Không có giọng nào | Chrome chưa nạp xong / Linux thiếu speech-dispatcher | Chờ `voiceschanged`; Linux cài `speech-dispatcher`+`espeak-ng` (chất lượng thấp — nên dùng Edge/Chrome có giọng Google) |
| Giọng Natural biến mất khi mất mạng | Giọng "Online (Natural)" của Edge cần mạng | Cài bản **local** Natural (OPERATIONS §1.1) hoặc chấp nhận rơi về giọng local |
| Nghe thử ra giọng khác giọng đang chọn | Gọi nhầm `speakCurated` thay vì `speakWithBrowserVoice` | Sửa theo SPEC-P181 §4 |
| Đổi giọng không ăn cho tới khi F5 | Thiếu `preferredURI` trong khoá `voiceCache` | Sửa theo 01-CONTRACTS §5 |

## 4. CẤM

- CẤM skill này hướng dẫn thêm key, SDK, sidecar hay dịch vụ trả tiền — đó là phạm vi của `elevenlabs-voice`.
- CẤM chép danh sách giọng thành nguồn chân lý thứ hai: `references/voice-catalog.md` phải ghi rõ nguồn chân lý là `src/core/voice/browser-voice-catalog.ts` + SPEC-P180 §4.
