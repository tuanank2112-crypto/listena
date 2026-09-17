# SPEC-P120 — Qualify WIP Plan11 P110–P112 và đóng ứng viên

## Đầu vào đo được (2026-09-17, working tree chưa commit trên `de28cab`)

### Kiểm kê WIP (git status, không suy diễn tác giả)

| File | Thay đổi | Đối chiếu contract Plan11 |
|---|---|---|
| `prisma/schema.prisma` + `prisma/migrations/20260916120000_plan11_integrity_receipts/migration.sql` | Attempt +`resultJson`, `enrichmentState` default `NOT_REQUESTED`, `enrichmentLeaseId`, `enrichmentLeaseExpiresAt`; ReviewLog +`resultJson` | **Khớp** P110 freeze. Chưa apply vào `prisma/dev.db` (migrate status: pending) |
| `src/lib/libsql-batch.ts` | +`withLibSqlWriteTransaction`; +mutex tiến trình `txLockTail` | Helper khớp; **mutex ngoài spec** → quyết định bên dưới |
| `src/lib/idempotency.ts` | +`LegacyResultUnavailableError` (409) | Khớp |
| `src/lib/client-intent.ts` (+test 70 dòng) | sessionStorage intent, hết hạn 24h | **Thiếu** owner-scoped key, clear on sign-out, chặn key mới khi pending |
| `src/server/services/learning.ts` (+933/−) | receipt v1, PENDING lease enrichment, CAS trong tx, replay từ receipt | Khớp hướng; **7 lỗi TS**; cần audit mastery writers |
| `src/server/services/lesson-authoring.ts` (+298/−) | graph trong write-tx, ledger CAS, `UNKNOWN`, `LessonGraphIncompleteError`, publish check `isTarget` | Khớp hướng; chưa có fault matrix |
| `src/app/teacher/lessons/new/page.tsx` | +`clientRequestId` + signature ref; manual vocab `isTarget:true` | Sửa được W11-F06; **không persist qua reload** |
| `src/app/api/teacher/generate-lesson/route.ts` | error opaque | Khớp W11-F10 |
| `src/app/api/attempt/route.ts`, `flashcard/route.ts` | map `LegacyResultUnavailableError` → 409 | Khớp |
| `flashcards-client.tsx`, `lesson-client.tsx` | intent persist qua sessionStorage, body đóng băng | Sửa hash drift W11-F02; **tạo key mới khi body đổi dù pending** |
| `learning.test.ts`, `libsql-batch.test.ts`, `ownership.test.ts` | cập nhật mock | 7 lỗi lint `no-explicit-any` |
| `learning-integrity.integration.test.ts` (401 dòng) | 5 case real SQLite | 3 PASS / 2 FAIL; 1 lỗi TS, 1 lỗi lint |

### Kết quả lệnh

```text
npm run type-check   → exit 2, 7 lỗi
  learning.ts:236  union {value: SubmitAttemptResult|null} không gán được vào {value: SubmitAttemptResult}
  learning.ts:244, 286, 795, 823  cast Row → kiểu cụ thể thiếu `unknown`
  learning-integrity.integration.test.ts:322 (×2)  'wordDiffs' không có trong SubmitAttemptResult
npx vitest run       → 449/451, 89 files, 10.18s; FAIL T111-02 (successCount 2≠1), T111-03/04 (revision 3 không > 3)
npx eslint .         → 8 lỗi (no-explicit-any: learning.test.ts 30,57,70,220; integration:183), 40 cảnh báo (baseline 33)
npx prisma migrate status → 10 migrations, pending: 20260916120000_plan11_integrity_receipts
```

## Phân tích 2 test FAIL (nguyên nhân gốc)

**T111-02.** Test gửi 2 review đồng thời với key khác nhau và kỳ vọng 1 thành công + 1 `OutcomePendingError`. WIP đọc `revision` **bên trong** `transaction("write")` và có mutex tiến trình → hai request serialize, request thứ hai đọc revision mới → CAS đúng → cả hai commit hợp lệ (2 log, revision +2). Đây là hành vi **đúng contract** (không có log thua, không mất update). Test sai giả định; bất biến vẫn đúng. Cách chứng minh phải đổi (xem §Test design).

**T111-03/04.** Test gửi 5 attempt **đúng hoàn toàn** và kỳ vọng `VocabularyMastery.revision` tăng. Attempt chỉ ghi VocabularyMastery cho lỗi từ (`INSERT … ON CONFLICT … revision+1`, `learning.ts:480–488`). Câu đúng → không lỗi → không ghi → revision không đổi. Hành vi đúng contract ("mọi writer tăng revision" — không writer thì không tăng). Test sai fixture.

## Hợp đồng P120 (chính xác)

### 1. Sửa biên dịch/lint (không đổi hành vi)

- `learning.ts:236`: tách kiểu `CoreCommitOutcome = { replayed: true; value: SubmitAttemptResult; enrichmentLeaseId: null } | { replayed: false; value: SubmitAttemptResult; enrichmentLeaseId: string | null }`; nhánh không có value phải `throw`, không trả `null`.
- Thêm `rowAs<T>(row: Row): T` trong `src/lib/libsql-batch.ts` (một chỗ), dùng ở 4 điểm cast; unit test cho `null`, số dạng string, bigint.
- `SubmitAttemptResult`: quyết định **một lần** có `wordDiffs` hay không. Khuyến nghị: **có**, vì replay deep-equality yêu cầu toàn bộ assessment gốc (Plan11 01-CONTRACTS "Attempt receipt preserves complete original assessment"). Thêm vào kiểu + receipt v1 + test.
- Lint: thay `any` bằng kiểu mock cụ thể (`vi.mocked<typeof executeAtomicLibSqlBatch>`), gỡ import không dùng (`executeAtomicLibSqlBatch`, `LibSqlBatchStatement`, `AttemptError`, `IdempotencyConflictError`). Đích: 0 lỗi, cảnh báo ≤33.

### 2. Test design mới (thay T111-02, T111-03/04 của Plan11; ghi "Quyết định bị thay thế" ở plan.md)

| ID | Case | Bất biến đo |
|---|---|---|
| T111-02a | 2 review đồng thời, key khác, cùng flashcard, real SQLite | 2 ReviewLog; `revision` +2; mỗi replay cùng key trả receipt bằng lần đầu (deep-equal); 0 lỗi 500 |
| T111-02b | Ép stale: wrapper test-only `withLibSqlWriteTransaction` chạy `UPDATE VocabularyMastery SET revision=revision+1` bằng **một tx khác trước khi** callback ghi (chỉ khả thi khi mutex tắt và dùng `BEGIN IMMEDIATE` thứ hai chờ) — nếu SQLite lock làm không khả thi, dùng fault-injection ở tầng `tx.execute` trả `rowsAffected=0` cho câu UPDATE CAS | throw `OutcomePendingError`; `tx.rollback` được gọi; ReviewLog loser = 0; revision/schedule không đổi (fingerprint bảng trước/sau bằng nhau) |
| T111-03a | 5 attempt đúng | counters LearnerProfile +5 phút/attempt theo rule hiện có; `VocabularyMastery.revision` **không đổi** |
| T111-03b | 5 attempt sai có lỗi từ trùng `vocab-passport` | mỗi attempt bump `revision` +1; `incorrectCount` +5 |
| T111-04 | xen kẽ attempt sai và review trên cùng vocabulary | không ghi đè stale: giá trị cuối bằng chuỗi serial tương ứng; revision = số writer |

### 3. Quyết định mutex tiến trình (`txLockTail`)

Đo trước khi quyết định: chạy T111-01 (20 same-key) và T111-02a **với mutex tắt** trên file SQLite qua `@libsql/client`. Ghi số lần `SQLITE_BUSY`/`SQLITE_BUSY_SNAPSHOT`.

- Nếu 0 BUSY → **bỏ mutex** (khuyến nghị): ít code, không tạo cảm giác an toàn giả trên Vercel multi-instance.
- Nếu có BUSY → giữ **bounded retry trong helper** (≤5, backoff 10/20/40/80/160 ms) **chỉ quanh `client.transaction("write")`**, không retry sau khi callback bắt đầu ghi. Mutex chỉ được giữ nếu retry không đủ, và **chỉ khi URL bắt đầu bằng `file:`**, kèm comment "local/E2E only; Turso serializes at server".
- CẤM giữ mutex vô điều kiện. CẤM coi mutex là cơ chế chống race ở hosted.

### 4. Client intent (theo 01-CONTRACTS)

- Key `listenai:${ownerId}:${kind}:${resourceId}`; `ownerId` lấy từ props server-render (user id trong session), không từ client state có thể sửa.
- `clearOwnerIntents(ownerId)` gọi trong flow sign-out hiện có và khi `ownerId` prop đổi.
- Khi body mới ≠ body intent pending: hiển thị trạng thái "Lần gửi trước chưa có kết quả", nút "Kiểm tra lại" (resend cùng key). Chỉ khi nhận 200 (replay) hoặc 409/4xx-validation xác định mới cho phép intent mới. 503/network → vẫn pending.
- Teacher new page chuyển sang module này với `kind` `lesson-manual`/`lesson-ai`; resourceId = signature hash body.

### 5. Migration

- CẤM `prisma migrate dev`/`deploy` lên `prisma/dev.db` trong P120. Test integration đã tạo DB tạm + `migrate deploy` — giữ cách này.
- Ghi vào ledger: tên migration, số hàng cũ có `resultJson IS NULL` trong fixture (kỳ vọng = số hàng seed), old-row replay → 409 `LEGACY_RESULT_UNAVAILABLE` có test.
- Nếu user muốn dev.db theo kịp: backup `prisma/dev.db.bak-plan11` rồi `migrate deploy` — **chỉ khi user yêu cầu tường minh**, ghi mốc trong plan.md.

### 6. Đóng ứng viên

- Sau khi (1)–(5) xanh: `git add` đúng các file WIP (không add `foo`, `test.xlsx`, file ký tự đặc biệt, `prisma/dev.db.bak-plan10`, `eval/report.md`), commit **khi user yêu cầu** với message `feat(plan11): P110-P112 integrity receipts candidate (not yet accepted)` + attribution theo phiên. Ledger ghi SHA.
- Chưa commit → mọi gate P120 tối đa UNVERIFIED.

## Vùng cấm

- CẤM hạ assertion để xanh (vd đổi `toBe(1)` thành `toBeGreaterThanOrEqual(1)` mà không đổi case).
- CẤM sửa hằng số SM-2/mastery để test qua.
- CẤM xoá cột/migration WIP để "làm sạch" — schema đã khớp P110 freeze.
- CẤM tạo LearningEvidence tổng hợp từ attempt/review legacy.
- CẤM dùng `executeAtomicLibSqlBatch` cho path có đọc-rồi-ghi (phải qua write-tx).

## Ma trận lỗi / caller

| Lỗi | Trạng thái | Caller |
|---|---|---|
| SQLITE_BUSY khi mở tx | chưa ghi gì | retry bounded trong helper; hết retry → `DatabaseUnavailableError` 503 |
| CAS rowsAffected=0 | rollback toàn bộ | 409 `OUTCOME_PENDING`; client reload schedule |
| Old row không receipt, replay | không mutation | 409 `LEGACY_RESULT_UNAVAILABLE`; link lịch sử |
| Intent khác owner trong storage | không gửi | xoá, không replay |
| Body đổi khi pending | không gửi key mới | UI yêu cầu "kiểm tra lại" trước |

## Nghiệm thu P120 (số phải đo)

- `npm run type-check` exit 0.
- `npx eslint .` 0 lỗi; cảnh báo ≤33 (không tăng ở file đã đổi).
- `npx vitest run` toàn bộ PASS; integration ≥6 case (T111-01, 02a, 02b, 03a, 03b, 04, 05, T112-04) PASS trên SQLite tạm; T111-02b có fingerprint trước/sau.
- Số đo BUSY ghi trong ledger cùng quyết định mutex.
- `client-intent.test.ts` có case owner-scoped, clear-on-signout, pending-block.
- Ledger có SHA ứng viên (nếu user cho commit) hoặc `WIP:` với diffstat.
