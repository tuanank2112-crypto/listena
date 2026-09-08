<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ListenAI — project binding

- Product direction (user, 2026-09-07): AI-native English self-learning. Mission, Coach and Daily Quest drive the learning loop; lessons, quizzes and flashcards support contextual remediation. Preserve learner context, server grading and adaptive evidence.
- Read `brain4agent/memory-distill.txt`, then `brain4agent/index.md` and the active plan before changes. Verify memory against code.
- The upstream managed block below contains the author's historical machine path. On this machine, use the downloaded `brain4agent.old/.agents/skills/.xay-dung-nao-bo/scripts/init_brain.js` under `$env:USERPROFILE/Documents/New project/`, with this repository as `rootDir` and `--check`. This project binding takes precedence over that literal path. Do not edit managed blocks to relocate it.

---

## 🔒 Luật khung do engine quản lý (tự sinh)

<!-- brain:rule:boot -->
1. **Bước 0 (Bắt buộc tiên quyết — Đồng Bộ & Boot Não Bộ):** Chạy `node C:\Users\hoang\.gemini\config\skills\.xay-dung-nao-bo\scripts\init_brain.js --check` (skill `.xay-dung-nao-bo`, CHỈ ĐỌC) để kiểm tra não bộ đã đạt chuẩn mới nhất trước khi xử lý bất kỳ yêu cầu nào. Chỉ khi kết quả là `CẦN NÂNG CẤP` mới chạy lại **không cờ** (chế độ GHI) và nêu tường minh trong phiên; mã thoát `2` = cần người xử — KHÔNG tự sửa tay vùng luật do engine quản lý.
<!-- /brain:rule:boot -->

<!-- brain:rule:cold-memory -->
**Ký ức lạnh (Cold Memory) — `memory/archive/`:** phân khu chứa các mục nhật ký đã xoay vòng khỏi `memory/hot/today.md`, mỗi file tên `YYYY-MM-DD.md`. CHỈ script xoay ký ức được ghi (append); CẤM sửa tay; CẤM coi là nguồn chân lý hiện trạng (kernel `memory-distill.txt` và `index.md` mới là). Engine chỉ tạo thư mục, KHÔNG sinh `.gitkeep`, KHÔNG quản lý script xoay; file không đúng mẫu tên bị `brain-doctor` báo `BRN-017`.
<!-- /brain:rule:cold-memory -->

<!-- brain:rule:spec-package -->
2. **BẮT BUỘC DẠNG SPEC PACKAGE — CẤM PLAN PHẲNG/MỎNG (luật chốt 2026-09-01):**
   Một kế hoạch KHÔNG được là một file `plan.md` dồn hết mọi thứ. Bắt buộc tách thành **bộ SPEC nhiều file**, mỗi file là MỘT hợp đồng độc lập:
   ```text
   planning/[STT]_[YYYY-MM-DD]_[Ten-Ngan]/
   ├── plan.md                          # HỒ SƠ kế hoạch (KHÔNG chứa thiết kế — xem mục 2.3)
   └── specs/                           # Bản thiết kế chi tiết (Spec-First)
       ├── 00-ARCHITECTURE.md           # Mục tiêu, Non-goals, Bất biến kiến trúc, Router thứ tự đọc
       ├── 01-CONTRACTS.md              # Contracts, Types, Schema/DDL bất biến
       ├── SPEC-Pxx-[Name].md           # Đặc tả từng mảng/bước thực thi cụ thể
       ├── OPERATIONS.md                # Deploy, runbook, thứ tự bắt buộc, rollback
       └── TESTING-ACCEPTANCE.md        # Ma trận test + bằng chứng nghiệm thu + Exit Gates
   ```
   - **2.1. Bộ SPEC tối thiểu:** phải phủ đủ 4 mảng — (a) kiến trúc & bất biến, (b) contract dữ liệu/API/module, (c) vận hành-deploy-rollback, (d) kiểm thử-nghiệm thu. Dự án lớn tách thêm SPEC theo từng tính năng.
   - **2.2. Mỗi file SPEC BẮT BUỘC có:** contract chính xác (chữ ký hàm/endpoint/schema, không mô tả chung chung); luật **BẮT BUỘC / CẤM** tường minh, kể cả **"vùng cấm"** (điều đã cân nhắc và quyết định KHÔNG làm, kèm lý do — chống việc agent sau "sửa lại cho tốt hơn"); bảng phân loại lỗi + hành vi bắt buộc của caller cho từng loại; số đo/bằng chứng nghiệm thu thật (không chỉ "test xanh").
   - **2.3. `plan.md` CHỈ được chứa:** Metadata Header (mục 3); **Nhật ký quyết định có mốc thời gian** — kèm mục **"Quyết định bị thay thế"** (không xoá lịch sử, không để hai phát biểu ngược nhau cùng sống); phân công Work Packages + Model Tier; checklist thực thi; bảng trỏ sang các file SPEC. **CẤM nhét thiết kế chi tiết vào `plan.md`.**
   - **2.4. Exit Gates phải đánh dấu theo môi trường** (vd `✅ local / ⬜ server`) — kế hoạch chỉ được đóng khi mọi gate của môi trường thật chuyển ✅.
   - **2.5. NGOẠI LỆ DUY NHẤT:** hotfix/patch nhỏ (`PATCH` SemVer, ≤1 ngày công) được phép chỉ có `plan.md`, nhưng vẫn đủ Metadata + nhật ký quyết định + checklist. Mọi đợt `MINOR`/`MAJOR` bắt buộc đủ bộ SPEC.
   - **2.6. Package cũ dạng phẳng** (file `NN-*.md` nằm thẳng trong thư mục kế hoạch, không có `specs/`) được GIỮ NGUYÊN theo Path Invariant — không đổi cấu trúc để tránh gãy tham chiếu; chỉ áp cấu trúc chuẩn cho kế hoạch MỚI.
<!-- /brain:rule:spec-package -->

<!-- brain:rule:structural-extension -->
2. **Mở Rộng Bắt Buộc Khi Đổi Nền Cấu Trúc (Structural Extension):** Kế hoạch nào thêm **THƯ MỤC TOP-LEVEL mới** (vd `app/`, `legacy/`, `.claude/agents/`) hoặc đưa vào **NGÔN NGỮ / KHUNG mới** (vd Rust, Tauri, React, Node ESM) thì BẮT BUỘC rà thêm **2 file ngoài Ma Trận 6 Điểm**: [`brain4agent/project-intro.md`](file:///brain4agent/project-intro.md) (mục tiêu, bản chất repo, tech stack) và [`brain4agent/-data-architecture.md`](file:///brain4agent/-data-architecture.md) (tầng lưu trữ, data flow). Lý do: hai file này KHÔNG thuộc 6 điểm nên dễ mô tả sai repo trong thời gian dài mà mọi kiểm tra tự động vẫn xanh; bản chất repo và tech stack chỉ con người rà được.
<!-- /brain:rule:structural-extension -->

<!-- brain:rule:root-marker -->
3. **NGOẠI LỆ TƯỜNG MINH — Marker Phiên Bản Khung Não:** Root được phép có **ĐÚNG MỘT** file `brain4agent-v<x.y.z>.md` do `init_brain.js` tự sinh và quản lý — đây là bản soi CHO NGƯỜI để nhìn thấy ngay ở root dự án đang chạy khung não phiên bản nào. **CẤM sửa tay** file này; **CẤM để tồn tại 2 file marker** trở lên (bump version thì script tự xoá bản cũ, sinh bản mới). Nguồn chân lý MÁY ĐỌC là `brain4agent/memory/hot/state.json` → field `brain_template_version`; file `.md` chỉ là bản dẫn xuất, KHÔNG được coi là nguồn chân lý. Field này khác với version DỰ ÁN (`current_version` trong `state.json`, hoặc `package.json`) — tuyệt đối không trộn/ghi đè lẫn nhau.
<!-- /brain:rule:root-marker -->

<!-- brain:rule:dual-entry -->
### J. Quy tắc Tương Thích Đa Agent — Bất Biến Hai Điểm Nạp (Dual Entry-Point Invariant)
1. Root repo BẮT BUỘC đủ 2 file: `AGENTS.md` = nguồn chân lý DUY NHẤT chứa toàn bộ luật; `CLAUDE.md` = shim mỏng ≤10 dòng, chỉ 1 dòng `@AGENTS.md` + ghi chú ngắn, TUYỆT ĐỐI không chứa luật.
2. Lý do: mỗi hãng agent đọc tên file khác nhau. Claude Code CHỈ auto-load `CLAUDE.md`; Gemini/Codex và agent theo chuẩn `agents.md` đọc `AGENTS.md`. Hai điểm nạp, MỘT nguồn chân lý.
3. CẤM: (a) chép/nhân bản luật sang `CLAUDE.md` → sinh 2 nguồn chân lý lệch nhau; (b) đổi tên `AGENTS.md` (các tài liệu trong repo + agent khác tham chiếu đúng tên này).
4. Khi khởi tạo dự án MỚI hoặc chạy skill `xay-dung-nao-bo`: PHẢI sinh ĐỦ CẢ HAI file, không sinh mỗi một cái.
5. Mở rộng: agent mới đọc tên file riêng (`GEMINI.md`, `.cursorrules`) → thêm shim mỏng trỏ về `AGENTS.md`, KHÔNG nhân bản luật.
6. Giới hạn `@import`: tối đa 4 hop lồng nhau, file ≤4 MiB mới được nạp.
7. Cách kiểm: sửa luật KHÔNG cần đụng `CLAUDE.md`; `CLAUDE.md` phình >10 dòng hoặc chứa câu luật là vi phạm. Kiểm nạp thật bằng `/context` ở phiên MỚI.
<!-- /brain:rule:dual-entry -->
