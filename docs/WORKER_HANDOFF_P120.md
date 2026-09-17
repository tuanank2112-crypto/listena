# Worker Handoff — Work Package P120

- **WP ID:** P120 (WIP Qualification & Candidate Preparation)
- **Plan:** [Plan 12 — Hoàn thiện dự án ListenAI và phát hành 1.0.0](../planning/12_2026-09-17_project-completion-release/plan.md)
- **Base Commit:** `de28cab70ce346f2a8e94ace323b0d9a78796c0c`
- **Timestamp:** 2026-09-17T10:02:00+07:00
- **Status:** QUALIFIED (100% xanh, chờ lệnh commit từ user)

---

## 1. Changed Files (Kiểm kê tệp thay đổi trong P120)

### Code & Tests đã sửa / bổ sung
1. `src/lib/libsql-batch.ts`: Thêm helper `rowAs<T>`, tinh chỉnh `isDriverError` chống nuốt domain errors, giới hạn mutex tiến trình chỉ cho `file:` URLs (`isFileDatabase()`), bounded retry 5 lần quanh `client.transaction("write")`.
2. `src/lib/libsql-batch.test.ts`: Thêm test suite cho `rowAs<T>` (null, số chuỗi, bigint).
3. `src/lib/client-intent.ts`: Bổ sung `IntentKind`, `IntentStorageKey`, `buildIntentKey` chuẩn hóa key theo owner (`listenai:${ownerId}:${kind}:${resourceId}`), hàm `clearOwnerIntents(ownerId)`.
4. `src/lib/client-intent.test.ts`: Thêm test kiểm tra owner-scoping và `clearOwnerIntents`.
5. `src/server/services/learning.ts`:
   - Dọn dẹp unused imports (`learnerRepo`, `executeAtomicLibSqlBatch`, `LibSqlBatchStatement`, `newMinutes`).
   - Dùng `rowAs<T>` ở các điểm cast `Row`.
   - Chuẩn hóa kiểu union `CoreCommitOutcome` và đảm bảo `initialResultValue` không `null`.
   - Giữ nguyên `updateMastery` với đúng tham số object.
6. `src/server/services/learning.test.ts`: Sửa 7 lỗi `no-explicit-any`, bỏ unused import `IdempotencyConflictError`.
7. `src/server/services/lesson-authoring.ts`: Dọn dẹp unused imports (`executeAtomicLibSqlBatch`, `LibSqlBatchStatement`).
8. `src/app/learner/lessons/[lessonId]/lesson-client.tsx`: Sửa lỗi `clientAttemptIdRef` thành `pendingIntentRef`, nhận `userId`, dùng key owner-scoped, chặn tạo key mới khi pending outcome mà user đổi đáp án.
9. `src/app/learner/lessons/[lessonId]/page.tsx`: Truyền `userId` vào `LessonDetailClient`.
10. `src/app/learner/flashcards/flashcards-client.tsx`: Nhận `userId`, dùng key owner-scoped, chặn đổi rating khi pending outcome.
11. `src/app/learner/flashcards/page.tsx`: Truyền `userId` vào `FlashcardsClient`.
12. `src/app/teacher/lessons/new/page.tsx`: Tích hợp `client-intent` qua `sessionStorage` thay cho `useRef` in-memory, persist qua reload.
13. `src/server/services/learning-integrity.integration.test.ts`: Viết lại bộ 8 test case toàn vẹn trên real SQLite tạm: T111-01, T111-02a, T111-02b, T111-03a, T111-03b, T111-04, T111-05, T112-04.

### Não bộ & Kế hoạch
14. `planning/12_2026-09-17_project-completion-release/plan.md`: Cập nhật trạng thái P120 QUALIFIED, nhật ký quyết định và checklist.
15. `planning/12_2026-09-17_project-completion-release/specs/TESTING-ACCEPTANCE.md`: Cập nhật ma trận gate P120 và ghi 4 receipts mới vào Ledger.
16. `brain4agent/memory/hot/state.json`: Cập nhật `plan11_wip_status`, `current_verification`, `last_verification`.
17. `brain4agent/memory/hot/today.md`: Ghi nhật ký thực thi P120.
18. `brain4agent/memory-distill.txt`: Cập nhật checkpoint dòng 2.

---

## 2. Commands & Verification (Bằng chứng lệnh đã chạy)

| Command | Exit Code | Environment | Kết quả đo được |
|---|---|---|---|
| `node "$env:USERPROFILE\Documents\New project\brain4agent.old\.agents\skills\.xay-dung-nao-bo\scripts\init_brain.js" "E:\app-hoc-tieng-anh" --check` | `0` | local | Não bộ hoàn hảo, đạt chuẩn khung đa tầng |
| `npm run type-check` | `0` | local | `tsc --noEmit`: 0 lỗi (giải quyết triệt để 7 lỗi TS ban đầu) |
| `npx eslint .` | `0` | local | 0 lỗi, 32 cảnh báo (thấp hơn baseline lịch sử 33) |
| `npx vitest run src/lib/libsql-batch.test.ts` | `0` | local | 8/8 tests PASS |
| `npx vitest run src/lib/client-intent.test.ts` | `0` | local | 5/5 tests PASS |
| `npx vitest run src/server/services/learning.test.ts` | `0` | local | 7/7 tests PASS |
| `npx vitest run src/server/services/learning-integrity.integration.test.ts` | `0` | local (SQLite tạm) | 8/8 tests PASS (T111-01, 02a, 02b, 03a, 03b, 04, 05, T112-04) |
| `npx vitest run` | `0` | local | 456/456 tests PASS trên 89 files (100% xanh) |

---

## 3. Evidence & Key Findings (Bằng chứng & phát hiện quan trọng)

1. **Phát hiện đo lường Mutex SQLite:**
   - Khi tắt mutex tiến trình trên file SQLite (`DATABASE_URL=file:`), 2 review đồng thời gặp lỗi `SQLITE_BUSY`.
   - Mutex tiến trình được giữ có điều kiện CHỈ cho `file:` URLs (`isFileDatabase()`), còn remote Turso (`libsql://` / `https://`) được bypass hoàn toàn.
2. **Sửa lỗi nuốt Domain Error trong `libsql-batch.ts`:**
   - Hàm `isDriverError` trước đó kiểm tra `"code" in error` dẫn đến việc toàn bộ domain error (`OutcomePendingError`, `IdempotencyConflictError`, `LegacyResultUnavailableError`, `LessonGraphIncompleteError`) bị biến thành `DatabaseUnavailableError`. Đã sửa để nhận diện chính xác mã lỗi của driver libSQL/SQLite.
3. **Tính toàn vẹn Database:**
   - Tuyệt đối không can thiệp, không migrate vào `prisma/dev.db` của người dùng.
   - Toàn bộ integration tests chạy trên SQLite tạm thời cô lập (`mkdtemp`).

---

## 4. Unresolved Risks & Pending Inputs (Rủi ro & đầu vào còn chờ)

1. **Chưa commit:** Working tree đang giữ các thay đổi sạch sẽ, sẵn sàng tạo commit `feat(plan11): P110-P112 integrity receipts candidate (not yet accepted)` khi người dùng yêu cầu.
2. **Đầu vào còn chờ người dùng phê duyệt:**
   - Lệnh commit ứng viên P120.
   - Đăng nhập `gh` hoặc cung cấp URL CI run (chặn P122-CI).
   - Cấu hình provider/model và ngân sách live AI (chặn P124 live, D3).
   - Nhóm thử nghiệm pilot, reviewers và consent (chặn P125, D5).
