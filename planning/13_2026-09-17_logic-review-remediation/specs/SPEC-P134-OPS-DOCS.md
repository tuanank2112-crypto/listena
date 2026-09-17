# SPEC-P134 — Vận hành, kiểm chứng, vệ sinh, tài liệu

Findings: D2, D3 (P2); D4, D8, D9, test flake, rác root, Plan12 header, audit (P3).

## Contract
1. **D3 verifier** `scripts/verify-turso-migration.ts`: bỏ hằng 27/48/45; sinh hợp đồng kỳ vọng bằng cách apply `prisma/migrations/**` lên SQLite tạm trong tmpdir (như agent đã làm) và so **cùng thuật toán** với DB đích; `_prisma_migrations` vào IGNORED; partial index so bằng chữ ký SQL chuẩn hoá. Exit 0 trên DB tạm vừa migrate (test tự thân `--self-test`).
2. **D4 drill** `scripts/verify-backup-restore.ts`: apply migration thật lên SQLite tạm, nạp `prisma/seed.ts` + `scripts/import-dataset.ts`, dump bằng `sqlite3`-free cách: đọc toàn bộ bảng qua libSQL → JSON → tạo DB mới từ migration → nạp lại → so hash từng bảng. In số bảng/row thật; CẤM chuỗi "100% data fidelity" khi có bảng bị bỏ qua.
3. **D2**: `docs/PRODUCTION_CUTOVER_RUNBOOK.md` mục rollback ghi rõ migration `20260916000000` không additive và cách áp an toàn (đã áp trên production; với DB mới phải chạy trong một transaction `turso db shell` `.bail on`).
4. **D8** `scripts/import-dataset.ts`: nếu `resolveApplicationRuntime()` là hosted (`APP_RUNTIME=vercel` hoặc Turso) → yêu cầu cờ `--allow-hosted` và biến `IMPORT_CONFIRM=<tên db>`; thiếu → exit 2, không ghi. (Worker E sửa phần guard ở đầu file; Worker B không đụng file này ngoài mục 2 SPEC-P132 — thực tế B **không** cần sửa file này; chỉ E.)
5. **D9** `.github/workflows/ci.yml`: `DATABASE_URL: "file:./dev.db"` (tương đối `prisma/`) hoặc tuyệt đối tmp; kèm chú thích quy ước.
6. **Flake**: `beforeAll(..., 60_000)` cho 2 integration file; `vitest.config` `hookTimeout: 60_000` nếu có cấu hình chung.
7. **Rác**: xoá `auth`, `auth-wal` (0 byte, untracked). Giữ `foo`, `test.xlsx`, file ký tự đặc biệt, `prisma/dev.db.bak-plan10`.
8. **Plan12 header**: Status IN PROGRESS (đã sửa), checklist cutover: tick với ghi chú "cutover 16:30, mail/AI hosted còn mở".
9. **Audit**: thử `npm audit fix --omit=dev` trên nhánh; nếu chỉ nâng `deepmerge-ts` transitive không đổi lockfile của prisma major → giữ; ngược lại ghi nhận và không nâng prisma. `prisma generate` phải còn chạy.
10. **README/docs**: mục "Answer Canvas", mục "Sinh bài AI riêng bất đồng bộ", mục auth throttle; `docs/RUNBOOK_INCIDENT.md` thêm kịch bản "gateway 524".

## Vùng cấm
- CẤM chạy verifier/drill/import với env hosted; CẤM `prisma migrate` lên `prisma/dev.db`.

## Nghiệm thu
- `npm run migration:verify -- --self-test` exit 0; `tsx scripts/verify-backup-restore.ts` in bảng đếm 31 bảng; CI yml hợp lệ (`node -e` parse YAML không có → dùng `npx yaml`? không cài thêm: kiểm bằng `git diff` và chạy `act` không có → chấp nhận review tay).
