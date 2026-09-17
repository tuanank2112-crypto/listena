# 01 — Contracts bổ sung (Plan12)

Plan12 kế thừa nguyên văn các contract Plan11 01-CONTRACTS: `MutationReceipt<T>`, `PendingIntent<T>`, `ReviewResult`, `withLibSqlWriteTransaction`, `CausalBasis`/`p11-v1`, `AcceptanceReceipt`. Không định nghĩa lại. Dưới đây chỉ là phần **mới** hoặc **làm chính xác thêm**.

## Bậc thang phiên bản (Version ladder)

| Bậc | Điều kiện nghiệm thu (tất cả ✅ ở môi trường ghi) | Gate Plan cũ được đóng | Ai quyết định bump |
|---|---|---|---|
| 0.5.0 (hiện tại) | — | — | — |
| 0.6.0 | D1 local + CI (P120, P121, P122-CI) | Plan10 P102/P103/P106 requalified; Plan11 local integrity/UI + CI | root sau receipt |
| 0.7.0 | D2 phần Preview: disabled fingerprint + enabled window + mail Preview + fence restored (P122) | Plan07 Preview disabled/enabled; Plan09 Preview | root sau receipt + user xác nhận cửa sổ |
| 0.8.0 | D4 + D3 phần offline/reviewer (P123, P124) | Plan11 local loop/eval + live/reviewer | root sau receipt |
| 0.9.0 | D5 pilot report (P125) | Plan11 pilot | root + user đọc report |
| 1.0.0 | D2 Production (server disabled → enabled → rollback drill), Plan09 mail prod, D6 handover (P126) | Plan07 server/rollback; Plan09 server | **user phê duyệt cutover**, root tag |

BẮT BUỘC: bump version chỉ trong commit phát hành của bậc đó, đồng thời ở `package.json`, `brain4agent/memory/hot/state.json.current_version` và `brain4agent/changelog.md`. CẤM bump trước khi gate của bậc ✅. CẤM trộn với `brain_template_version`.

Quyết định bị thay thế được ghi ở plan.md: Plan07 0.6.0 / Plan09 0.7.0 / Plan10 0.8.0 không còn là mốc; bậc thang này là mốc.

## Ledger nghiệm thu

Vị trí: `planning/12_2026-09-17_project-completion-release/specs/TESTING-ACCEPTANCE.md` mục "Ledger". Mỗi dòng là một `AcceptanceReceipt` (Plan11) rút gọn thành bảng:

```text
| WP | caseId | env | commitSha | command | exit | counts | artifact (path/hash hoặc URL) | gate | reviewedBy | date |
```

- BẮT BUỘC `commitSha` là SHA đầy đủ của ứng viên đã commit; WIP chưa commit ghi `WIP:<short-diffstat>` và gate tối đa UNVERIFIED.
- BẮT BUỘC `counts` số cụ thể (vd `tests=451,failed=0`), không "all pass".
- CẤM artifact chứa secret, transcript learner thật, giá trị token/DSN.
- Gate Plan07/09/10/11 khi đóng bởi Plan12 phải được đánh dấu ở **cả hai nơi**: ledger Plan12 và bảng gate của plan gốc (chỉ thêm dấu ✅ + ngày + trỏ receipt, không sửa chữ cũ).

## Contract giao dịch ghi — làm chính xác thêm

```ts
// Giữ chữ ký Plan11:
withLibSqlWriteTransaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T>;
```

Bổ sung bất biến (SPEC-P120 quyết định chi tiết):

1. **Serialization là trách nhiệm của DB, không của tiến trình.** Mutex tiến trình (`txLockTail`) hiện có trong WIP không được coi là cơ chế đúng đắn cho hosted (mỗi instance Vercel một mutex riêng). Nếu giữ, chỉ được kích hoạt cho `DATABASE_URL` dạng `file:` (local/E2E) với comment nêu rõ lý do (tránh SQLITE_BUSY của file SQLite); với Turso phải tắt. Nếu bỏ, phải có bounded retry SQLITE_BUSY/`SQLITE_BUSY_SNAPSHOT` (≤5 lần, backoff 10–160 ms) **bên trong** helper trước khi mở tx, không retry sau khi đã ghi.
2. Mọi đọc làm cơ sở cho ghi (revision, mastery, ledger status, lease) **phải** qua `tx`. Đọc trước tx chỉ được dùng để validate ownership/publication, không làm cơ sở tính toán.
3. CAS `rowsAffected !== 1` → throw trong callback → rollback. Đây là guard phòng vệ; với đọc-trong-tx và write lock, nó không được kỳ vọng xảy ra dưới tải bình thường. Test phải chứng minh cả hai: (a) đồng thời → serialize hợp lệ; (b) ép stale → rollback sạch.

## Contract client intent — làm chính xác thêm

```ts
// src/lib/client-intent.ts (WIP) — bổ sung bắt buộc
type IntentStorageKey = `listenai:${ownerId}:${kind}:${resourceId}`; // kind = attempt | flashcard | lesson-manual | lesson-ai
export function getStoredIntent<T>(key: IntentStorageKey): ClientPendingIntent<T> | null;
export function setStoredIntent<T>(key: IntentStorageKey, intent: ClientPendingIntent<T>): void;
export function clearStoredIntent(key: IntentStorageKey): void;
export function clearOwnerIntents(ownerId: string): void; // gọi khi sign-out / owner switch
```

- BẮT BUỘC key chứa `ownerId` (user id từ session) — WIP hiện dùng `listenai_flashcard_<cardId>` không có owner: hai tài khoản trên cùng trình duyệt có thể replay intent của nhau. Đây là lỗi phải sửa ở P120.
- BẮT BUỘC khi body mới khác body intent đang pending (user đổi đáp án/rating) → **không** tự tạo key mới nếu intent cũ chưa có outcome xác định (200/409/4xx-validation). UI hiển thị "đang chờ kết quả lần gửi trước" và cho phép "kiểm tra lại" (resend cùng key) trước. WIP hiện tạo key mới ngay khi đáp án khác → nguy cơ 2 attempt commit. Phải sửa ở P120.
- BẮT BUỘC teacher new page dùng cùng module (persist qua reload), không dùng `useRef` in-memory riêng.
- CẤM lưu validator/đáp án đúng/raw memory trong storage; chỉ lưu body mà client vốn đã gửi.

## Contract receipt — làm chính xác thêm

- `SubmitAttemptResult` phải là **kiểu đóng** (closed type) và receipt `attempt-result-v1` serialize đúng kiểu đó; test không được truy cập field không có trong kiểu (lỗi TS hiện tại `wordDiffs`). Nếu `wordDiffs` cần cho replay equality, thêm vào kiểu và receipt **một lần** ở P120; nếu không, bỏ khỏi test.
- Hàm nội bộ trả `{ replayed, value, enrichmentLeaseId }` phải có kiểu union rõ ràng: `value` không nullable ở nhánh `replayed:false` khi commit thành công; nhánh lỗi throw, không trả null. Sửa lỗi TS `learning.ts:236`.
- Cast từ `Row` libSQL sang kiểu cụ thể phải qua một helper `rowAs<T>(row: Row): T` (`as unknown as T`) tại một chỗ, có unit test cho các trường hợp `null`/số dạng chuỗi/bigint. Sửa 4 lỗi TS cast.

## Contract đầu vào của user (blocking inputs)

| Input | Chặn WP | Giá trị mặc định khi chưa có | Ghi nhận ở |
|---|---|---|---|
| Đăng nhập `gh` (hoặc cấp URL run CI) | P122-CI | UNVERIFIED | plan.md nhật ký |
| Phê duyệt cửa sổ Preview enabled (clone, thời lượng, endpoint) | P122-hosted | không mở cửa sổ | Plan07 OPERATIONS manifest |
| Provider/model + cap `--max-calls`/`--max-cost-usd` | P124 live | offline only | Plan11 SPEC-P115 |
| Nhóm pilot, reviewer (≥2), consent/retention | P125 | không tuyển | Plan11 SPEC-P115 §Pilot |
| Phê duyệt final export/cutover/public traffic | P126 | Production disabled | Plan07 OPERATIONS |

CẤM suy diễn phê duyệt lịch sử từ commit/report; mỗi cửa sổ hosted cần phê duyệt ghi mốc thời gian trong plan.md.

## Ma trận lỗi / caller (cấp contract)

| Lỗi | Hành vi |
|---|---|
| Receipt thiếu field bắt buộc | ledger từ chối; gate UNVERIFIED |
| Version bump không đủ 3 nơi | commit phát hành bị coi không hợp lệ; sửa trước tag |
| Intent key thiếu owner | P120 FAIL; không merge |
| Body đổi khi intent pending mà client tạo key mới | T111-06 FAIL |
| `withLibSqlWriteTransaction` có network I/O trong callback | code review FAIL; không merge |
