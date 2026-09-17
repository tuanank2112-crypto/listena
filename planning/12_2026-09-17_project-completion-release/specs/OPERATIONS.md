# OPERATIONS — Plan12

## Thứ tự bắt buộc

```text
Boot não (--check) → đọc Plan12 router → P120 (local) → P121 (local) ─┬→ P122-CI (cần gh) → P122-Preview disabled → P122-Preview enabled (phê duyệt)
                                                                      ├→ P123 (local)  → P124 offline → P124 live (cap, phê duyệt)
                                                                      └→ P125 (sau P122-enabled + P124; 4 input user) → P126 (Go/No-Go, phê duyệt ×2)
```

- Mỗi phiên làm việc bắt đầu bằng `init_brain.js <repo> --check`; chỉ ghi khi engine báo cần nâng cấp.
- Mỗi WP kết thúc bằng receipt vào ledger (TESTING-ACCEPTANCE) và đồng bộ não (kernel/index/hot/state/roadmap/changelog/gotchas) — không để não lệch code như đã xảy ra ngày 16→17.
- Snapshot branch/SHA/diffstat ở đầu mỗi phiên; WIP chưa commit ghi `WIP:`.

## Runbook local (P120/P121/P123/P124-offline)

1. `npm run type-check` → `npx eslint .` → `npx vitest run` → `npm run build` → `npm run test:e2e` (DB tạm qua `e2e/setup.ts`) → `npm run eval:quality -- --dry-run` → `npm run eval:learning -- --mode offline …` (sau P124).
2. Integration real-DB: mỗi file test tạo `mkdtemp` + `prisma migrate deploy` lên file rỗng (Windows cần tạo file trước) — mẫu đã có trong `learning-integrity.integration.test.ts`. CẤM trỏ `DATABASE_URL` vào `prisma/dev.db`.
3. Python sidecar: `pytest tts-service` chỉ khi host có deps; không tải model; nếu thiếu → ghi "không chạy", không ghi FAIL.
4. `npm audit --omit=dev` khi đổi dependency hoặc trước Go.
5. Coverage: `npm run test:coverage` — ghi % cho module đổi.
6. Commit chỉ khi user yêu cầu; message theo conventional + attribution phiên; không add `foo`, `test.xlsx`, file ký tự đặc biệt, `*.db*`, `eval/report.md`.

## Runbook hosted (P122/P125/P126)

Theo Plan07 OPERATIONS + manifest SPEC-P122 §C. Tối thiểu mỗi cửa sổ:

```text
1. Ghi manifest + mốc phê duyệt vào plan.md
2. Xác nhận target ≠ canonical staging ≠ Production (tên DB in ra, không DSN)
3. fingerprintBefore (script read-only)
4. Thực thi case theo bảng gate
5. fingerprintAfter; restore MIGRATION_WRITE_MODE=disabled; redeploy; readback fence; fingerprintRestored
6. Receipt + đánh dấu gate ở plan gốc và Plan12
```

- CẤM đọc/in giá trị secret; CẤM seed/reset; CẤM staging promotion; CẤM D1 mutation trước final export được duyệt.
- Cửa sổ không đóng được → ưu tiên tuyệt đối đóng fence trước mọi việc khác; ghi incident.

## Rollback theo WP

| WP | Rollback |
|---|---|
| P120/P121/P123 | revert commit ứng viên; DB tạm tự huỷ; migration additive nullable giữ được, không DROP cột đã có dữ liệu |
| P122 Preview | redeploy SHA trước + fence disabled; clone disposable có thể huỷ; canonical staging không đụng |
| P124 live | không có rollback dữ liệu; cap đã chi ghi vào ledger; artifact ở `eval/runs` ignore |
| P125 pilot | dừng thu thập theo consent; xoá theo yêu cầu withdrawal; giữ aggregate |
| P126 | Plan07 §Rollback: trước enable = flip về Worker+D1 lossless; sau enable = reconcile Turso→D1 rồi flip |

## Phê duyệt và uỷ quyền

- Phê duyệt phải là câu của user trong phiên, ghi mốc thời gian + phạm vi vào plan.md Plan12 §Nhật ký. Không suy từ commit/report/ checkbox cũ.
- Spawn worker/agent chỉ khi user cho phép trong phiên triển khai; tier trong bảng WP là mức review, không phải quyền spawn.
- Worker report phải có: SHA, paths, lệnh + exit + count, readback DB, case fail, môi trường, gate còn mở. Root không nhận "đã xong" không kèm số.

## Ma trận lỗi / operator

| Lỗi | Hành vi |
|---|---|
| Não lệch code khi boot | dừng, đối chiếu, ghi lệch vào nhật ký trước khi làm tiếp |
| `gh` chưa đăng nhập | CI UNVERIFIED; hỏi user 1 lần; tiếp tục local |
| Windows Prisma migrate lỗi "Schema engine error" rỗng | tạo file DB rỗng trước (gotcha đã biết) |
| Next dev server cũ giữ lock | dừng PID cũ trước E2E (gotcha đã biết) |
| Phê duyệt thiếu cho hành động hosted | không làm; chuẩn bị manifest và local evidence |
| Provider outcome UNKNOWN | ghi UNKNOWN; không tự gọi lại |

## Bằng chứng vận hành cần có khi đóng Plan12

- Chuỗi receipt đầy đủ P120→P126.
- Mọi cửa sổ hosted có fingerprint before/after/restored.
- Không secret trong bất kỳ artifact tracked.
- Não bộ đồng bộ tại SHA release; `brain4agent-v1.4.0.md` marker giữ nguyên (không sửa tay).
