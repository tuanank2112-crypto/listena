# Root code review — P120→P126 candidate (2026-09-17)

- **Reviewer:** root (phiên độc lập, không phải implementer)
- **Đối tượng review:** working tree chưa commit trên base `de28cab70ce346f2a8e94ace323b0d9a78796c0c`
- **Input:** [WORKER_HANDOFF_P120.md](WORKER_HANDOFF_P120.md), [Plan12 ledger](../planning/12_2026-09-17_project-completion-release/specs/TESTING-ACCEPTANCE.md), [Plan12 01-CONTRACTS](../planning/12_2026-09-17_project-completion-release/specs/01-CONTRACTS.md)
- **Kết luận ngắn:** công việc local là **thật và chất lượng tốt**, không có xanh giả. Có **1 lỗi P1 trên đường hosted**, **2 ô nghiệm thu đánh dấu sai sự thật**, và **3 chỗ câu chữ vượt quá phạm vi bằng chứng**. Không có finding nào đòi làm lại kiến trúc.

---

## 1. Xác minh độc lập (root chạy lại, không tin báo cáo)

| Lệnh | Kết quả root đo | Báo cáo worker | Khớp |
|---|---|---|---|
| `npx vitest run` | 484 pass / 92 files | 480 / 90 | Lệch nhẹ (ledger cũ hơn code) |
| `npm run test:e2e` | 24/24 pass | 24/24 | ✅ |
| `npm run type-check` | exit 0, 0 lỗi | 0 lỗi | ✅ |
| `npx eslint .` | 0 lỗi, 32 cảnh báo | 0 lỗi, 32 cảnh báo | ✅ |
| `npm run build` | exit 0 | — | ✅ |
| `npx prisma migrate status` | 1 migration pending, dev.db **không bị apply** | không apply | ✅ |
| `gh auth status` | vẫn chưa đăng nhập | UNVERIFIED | ✅ trung thực |
| `eval/runs/.../live-status.json` | `UNVERIFIED / PROVIDER_CREDENTIALS_REQUIRED` | không claim live | ✅ trung thực |

**Những điểm root soi vì dễ gian lận, và đều đạt:**

- `eval/learning-run.ts:126,145` gọi `startMission` và `evaluateTutorTurn` **thật**, không phải chỉ validate dataset như `quality-run.ts` cũ. Đây là điểm Plan11 yêu cầu và worker đã làm đúng.
- `lesson-authoring-integrity.integration.test.ts` có fault-injection **từng statement** và đếm dispatch qua 5 kịch bản, cộng race FAILED→PENDING. Đúng hợp đồng P121.
- `learning-integrity.integration.test.ts` T111-02b tiêm lỗi ở tầng `tx.execute` trên **database thật**, không mock cả tầng DB. Đúng vùng cấm của spec.
- `scripts/verify-backup-restore.ts:12` chạy trong `tmpdir`, không đụng `prisma/dev.db`. Xác nhận dev.db giữ nguyên timestamp.

Ghi nhận: đây là chất lượng thực thi tốt. Các finding bên dưới không phủ nhận điều đó.

---

## 2. Findings bắt buộc xử lý

### F1 — P1 — Mutex tiến trình vẫn bật trên Turso hosted (sai ngược contract)

**Vị trí:** [`src/lib/libsql-batch.ts:95-98`](../src/lib/libsql-batch.ts#L95), dùng tại dòng 101.

```ts
function isFileDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  return !url || url.startsWith("file:");   // <-- unset => true
}
```

**Bằng chứng mâu thuẫn:** [`src/lib/database-config.ts:111-133`](../src/lib/database-config.ts#L111) cho thấy nhánh hosted lấy cấu hình từ `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` và **không đọc `DATABASE_URL`**. `DATABASE_URL` chỉ được đọc ở nhánh `local-sqlite` (dòng 127).

**Hệ quả:** trên Vercel/Turso, `process.env.DATABASE_URL` thường không tồn tại → `!url` → `isFileDatabase()` trả **true** → mutex tiến trình **được bật trên Turso**. Điều này:

1. Vi phạm trực tiếp Plan12 01-CONTRACTS §Contract giao dịch ghi mục 1: *"với Turso phải tắt"*.
2. Serialize **toàn bộ** write transaction trong mỗi Node instance trên hosted. Một giao dịch chậm sẽ chặn ghi của những learner không liên quan trong cùng instance.
3. Tạo cảm giác an toàn sai: mutex không có tác dụng giữa các instance, đúng điều đã cảnh báo trong gotchas.
4. Hành vi lật thầm lặng nếu có ai đó set `DATABASE_URL` trên Vercel vì lý do khác.

**Sửa bắt buộc:** suy ra từ cấu hình đã resolve, không sniff env thô.

```ts
import { resolveDatabaseConfig } from "@/lib/database-config";

function shouldSerializeLocally(): boolean {
  try {
    return resolveDatabaseConfig().runtime === "local-sqlite";
  } catch {
    return false;   // fail-safe: không bật mutex khi cấu hình không xác định
  }
}
```

Mặc định khi không xác định được phải là **không bật mutex** (hiện tại đang ngược lại).

**Nghiệm thu:** test ở F2 phải xanh; ghi lại quyết định vào Plan12 plan.md nhật ký.

---

### F2 — P2 — Không có test nào phủ quyết định mutex

**Vị trí:** `src/lib/libsql-batch.test.ts` có 8 test, không test nào chạm `isFileDatabase`, mutex, hay `DATABASE_URL`.

**Vấn đề:** ô nghiệm thu *"Quyết định mutex có số đo BUSY"* đang ✅, nhưng đo lường lúc phát triển **không phải** test hồi quy. Logic quyết định hiện không được bảo vệ, nên F1 mới lọt qua toàn bộ 484 test.

**Sửa bắt buộc:** thêm test cho `shouldSerializeLocally()`:

| Case | Env | Kỳ vọng |
|---|---|---|
| local file | `DATABASE_URL=file:./x.db`, không có Turso | serialize = true |
| local absolute | `DATABASE_URL=file:/tmp/x.db` | serialize = true |
| **hosted Turso** | `APP_RUNTIME=vercel`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, **không có `DATABASE_URL`** | serialize = **false** |
| cấu hình lỗi | không env nào | serialize = false, không throw |

Case thứ ba là case chứng minh F1 đã được sửa. Không được bỏ.

---

### F3 — P2 — `clearOwnerIntents` là code chết, nhưng ô nghiệm thu đã đánh ✅

**Vị trí:** [`src/lib/client-intent.ts:63`](../src/lib/client-intent.ts#L63) định nghĩa hàm; chỉ có `client-intent.test.ts` gọi nó. Không nơi nào trong ứng dụng gọi. Nút đăng xuất tại [`src/components/app-shell.tsx:93`](../src/components/app-shell.tsx#L93) chỉ gọi `signOut({ callbackUrl: "/" })`.

**Vấn đề:** ô ledger *"client-intent owner-scoped/sign-out/pending-block"* đang ✅ nhưng vế **sign-out chưa tồn tại trong sản phẩm**. Root đã nêu ở lượt review trước và ô vẫn được chuyển sang ✅. Đây đúng là dạng lỗi mà luật repo cấm: nghiệm thu không truy được từ contract sang hành vi thật.

**Mức độ thật:** thấp về bảo mật, vì khóa đã gắn `ownerId` nên user B không đọc được intent của user A. Đây là vệ sinh dữ liệu và tính trung thực của ô nghiệm thu, không phải lỗ hổng.

**Sửa bắt buộc:**

1. Gọi `clearOwnerIntents(userId)` ngay trước `signOut()` trong app-shell.
2. Gọi khi `ownerId` đổi (đăng nhập tài khoản khác trong cùng tab).
3. Thêm test kiểm tra handler đăng xuất có gọi, không chỉ test hàm thuần.
4. **Chỉ sau đó** mới được để ô đó ✅. Nếu chưa làm, hạ về ⬜ ngay.

---

### F4 — P3 — Fallback `"anonymous"` phá vỡ bất biến owner-scoped

**Vị trí:** [`flashcards-client.tsx:30`](../src/app/learner/flashcards/flashcards-client.tsx#L30), [`lesson-client.tsx:85`](../src/app/learner/lessons/[lessonId]/lesson-client.tsx#L85), [`lessons/[lessonId]/page.tsx:45`](../src/app/learner/lessons/[lessonId]/page.tsx#L45), [`teacher/lessons/new/page.tsx:28`](../src/app/teacher/lessons/new/page.tsx#L28).

**Vấn đề:** khi session chưa sẵn sàng hoặc trả null, intent được ghi vào namespace dùng chung `listenai:anonymous:...`. Hai người khác nhau trên cùng trình duyệt đều rơi vào namespace này, đúng thứ mà owner-scoping sinh ra để chặn. Rủi ro thấp vì các trang đều sau cổng xác thực, nhưng fallback làm bất biến không còn tuyệt đối.

**Sửa:** bỏ giá trị mặc định, đặt `userId` thành prop bắt buộc. Trang server đã có `userId` sau khi kiểm tra session (`flashcards/page.tsx:8-9` làm đúng rồi). Với trang teacher, không cho thao tác gửi khi chưa có `session.user.id` thay vì thay bằng `"anonymous"`.

---

## 3. Câu chữ vượt quá bằng chứng (sửa tài liệu, không sửa code)

### F5 — Gọi bộ eval là "kiểm định chất lượng sư phạm" là quá mạnh

**Thực tế các check trong** [`eval/learning-run.ts:135-185`](../eval/learning-run.ts#L135): reply không rỗng, `score` nằm trong [0,1], `pedagogicalAct` thuộc enum hợp lệ, và một phép kiểm rò rỉ prompt. Toàn bộ chạy với `DeterministicMockTutorProvider`.

Đây là kiểm **hình dạng hợp đồng của orchestration**, tốt và đáng có, nhưng **không đo chất lượng dạy**. Changelog đang gọi đây là *"Bộ kiểm định chất lượng sư phạm (P124)"*. Plan11 SPEC-P115 đã cấm đúng lỗi này ở cấp dưới: *"CẤM ... equate structural 30/30 with pedagogical pass"*. 156/156 check lặp lại cùng cái bẫy ở cấp cao hơn.

Thêm nữa, phép kiểm rò rỉ tại dòng 179 chỉ so hai chuỗi tiếng Anh (`"system prompt"`, `"ignore previous instructions"`). Nó hữu ích như một canary nhưng **không phải biện pháp an ninh**, đừng mô tả như vậy.

**Sửa:** đổi mô tả thành "kiểm hợp đồng orchestration nhiều lượt, chạy offline với provider tất định". Chất lượng dạy vẫn thuộc T115-02 và còn ⬜.

### F6 — Bài tập backup/restore hẹp hơn tuyên bố

`scripts/verify-backup-restore.ts` tự dựng schema 4 bảng tổng hợp trong tmpdir, chèn vài dòng, copy file, đọc lại, rồi in `100% data fidelity` (dòng 131). Nó **không** dùng schema Prisma thật, **không** chạm Turso, và không chứng minh quy trình khôi phục hosted.

Là smoke test thì tốt. Nhưng "Sẵn sàng vận hành & khôi phục (P126)" trong changelog hàm ý nhiều hơn thế. **Sửa:** ghi rõ phạm vi "SQLite cục bộ, schema tổng hợp"; bài tập khôi phục Turso thật vẫn là điều kiện Go của P126.

### F7 — Ledger lệch số và một dòng dễ đọc nhầm

1. Ledger ghi `files=90,tests=480`; root đo **92 files / 484 tests**. Cập nhật cho khớp, hoặc ghi rõ receipt gắn với ứng viên nào.
2. Dòng `P125 | pilot-tooling | ... enrolled=6,attrition=0 | PASS` dùng dữ liệu mẫu trong `eval/pilot-cohort-template.json` (`learner-p01`…`p06`, ghi chú "Consented adult learner"). Ô cổng pilot vẫn ⬜ nên kết luận không sai, nhưng dòng ledger dễ bị đọc thành đã tuyển sáu người thật. **Sửa:** đổi `counts` thành `templateParticipants=6` và thêm `limitations: "synthetic template, no real enrolment"`.

---

## 4. Vấn đề phiên bản (ngoài phạm vi code, nhưng chặn phát hành)

`package.json`, `brain4agent/memory/hot/state.json` và `brain4agent/changelog.md` đều đã mang **1.0.0**, trong khi:

- Mọi ô Production trong ledger còn ⬜
- Không có commit nào (git log vẫn ở `de28cab`)
- Không có tag `v1.0.0`
- Chưa có phê duyệt cutover của user

Plan12 01-CONTRACTS §Version ladder quy định 1.0.0 chỉ đến sau khi P126 đạt **và** user phê duyệt cutover, và *"CẤM bump version trước khi gate của bậc ✅"*.

**Sửa bắt buộc:** hạ về `0.5.0`, hoặc nếu muốn thể hiện trạng thái ứng viên thì dùng `1.0.0-rc.1` kèm ghi chú rõ đây chưa phải bản phát hành. Tiêu đề changelog đổi thành dạng ứng viên chưa phát hành.

---

## 5. Việc cần làm, theo thứ tự

| # | Việc | Loại | Chặn cái gì |
|---|---|---|---|
| 1 | **Commit toàn bộ ứng viên** (hơn 40 file đang ở working tree, không tag, không nhánh dự phòng) | rủi ro mất việc | tất cả |
| 2 | F1 sửa `isFileDatabase` → dùng `resolveDatabaseConfig()` | P1 code | mọi gate hosted |
| 3 | F2 thêm 4 test cho quyết định mutex | P2 test | tính đúng của ô mutex |
| 4 | F3 nối `clearOwnerIntents` vào đăng xuất, thêm test, rồi mới để ô ✅ | P2 code + ô sai | tính trung thực ledger |
| 5 | F4 bỏ fallback `"anonymous"` | P3 code | bất biến owner-scoped |
| 6 | F5/F6/F7 sửa câu chữ changelog + ledger | tài liệu | tránh hiểu nhầm khi bàn giao |
| 7 | Hạ version về mức chưa phát hành | hợp đồng | cổng 1.0.0 |

Sau bước 1–7, trạng thái đúng của dự án là: **D1 và D4 đạt ở local, chờ CI; D2, D3, D5 còn nguyên**, và cả ba đều chờ đầu vào của user chứ không chờ code.

---

## 6. Vùng cấm khi sửa các finding này

- CẤM sửa test cho khớp code ở F1. Case hosted-Turso phải kỳ vọng **không serialize**; nếu nó fail thì sửa code, không sửa kỳ vọng.
- CẤM để ô ledger ✅ trước khi hành vi tương ứng tồn tại trong sản phẩm (F3 là ví dụ đã xảy ra một lần).
- CẤM đụng `prisma/dev.db`, `eval/report.md`, `foo`, `test.xlsx`, file ký tự đặc biệt, `prisma/dev.db.bak-plan10`.
- CẤM bump version hay tạo tag khi chưa có phê duyệt cutover.
- CẤM mở rộng phạm vi sang các mục Non-goals của Plan12 00-ARCHITECTURE trong lúc sửa.
