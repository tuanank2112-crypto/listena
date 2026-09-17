# SPEC-P126 — Phát hành 1.0.0: Go/No-Go, cutover, rollback drill, vận hành hậu phát hành, handover

Runbook cutover/rollback: [Plan07 OPERATIONS](../../07_2026-09-10_vercel-turso-migration/specs/OPERATIONS.md) §Pre-cutover and final-export runbook, §Rollback and reconciliation boundary — **authority, không đổi**. File này thêm: tiêu chí Go/No-Go, thứ tự phê duyệt, vận hành sau phát hành, và handover.

## Go/No-Go (root trình, user quyết)

| Điều kiện Go | Nguồn bằng chứng |
|---|---|
| D1 ✅ local + CI (0.6.0 đã bump) | ledger P120/P121/P122-CI |
| D2 Preview disabled/enabled ✅, mail Preview ✅ (0.7.0) | ledger P122 |
| D4 ✅, D3 offline+reviewer ✅ và ≥1 live coaching hosted (0.8.0) | ledger P123/P124 |
| D5 report nộp (0.9.0) và khuyến nghị release **không phải "No"** | ledger P125 |
| Rollback asset Cloudflare Worker + D1 còn truy cập; snapshot D1 final mới sinh | Plan07 §Rollback |
| Turso Production target riêng (không phải staging/clone), quota/headroom ghi | Plan07 OPERATIONS mục 1–2 |
| Runbook backup/restore Turso có bài test khôi phục thật lên DB tạm | P126 §Ops |
| Không advisory runtime high/critical mới (`npm audit --omit=dev`) | receipt fresh |

Bất kỳ dòng nào ⬜ → **No-Go**; ghi lý do và WP quay lại.

## Thứ tự cutover (Plan07, tóm tắt để xếp lịch)

1. **Server disabled**: user phê duyệt final export → sinh snapshot D1 final (hash ghi) → import một chiều vào Production Turso mới → verifier read-only PASS → deploy ứng viên Production với `MIGRATION_WRITE_MODE=disabled` → login/read all-table fingerprint ✅ → mutation bị chặn ✅.
2. **Rollback drill trước enable**: chứng minh đường quay về Worker+D1 không mất dữ liệu (chưa có ghi mới nên lossless); ghi lệnh + thời gian.
3. **Server enabled**: phê duyệt riêng → `MIGRATION_WRITE_MODE=enabled` → first write (register synthetic) → persistence/ownership readback → mail prod (Plan09: verification, reset, feedback) → provider live smoke bounded (cap từ P124) → public traffic/DNS theo Plan07.
4. **Sau enable**: ghi "reconciliation risk": mọi rollback sau đây phải reconcile dữ liệu Turso → D1 trước khi flip; không flip mù.

- BẮT BUỘC mỗi bước một mốc phê duyệt riêng trong plan.md (bước 1 và 3 tối thiểu).
- CẤM cutover từ working tree bẩn; ứng viên = tag `v1.0.0-rc.N` trên SHA sạch.

## Vận hành hậu phát hành (mới trong Plan12)

| Hạng mục | Contract tối thiểu | Bằng chứng |
|---|---|---|
| Backup/restore | Turso: lịch snapshot hoặc export định kỳ (tần suất do user quyết, mặc định hằng ngày); bài **restore thật** lên DB tạm + verifier PASS ≥1 lần trước Go | log restore + verifier output |
| Giám sát | Vercel logs + Pino level `info`; alert tối thiểu: 5xx rate, `DatabaseUnavailableError` count, provider `rate_limited`/`unavailable` count; kênh nhận alert do user chọn | screenshot/rule export không secret |
| Cost cap | Provider AI: cap cứng bằng budget reservation hiện có (40/24h) + cap tài khoản provider; Turso/Vercel Hobby quota ghi headroom; ngưỡng cảnh báo 80% | bảng quota tại ngày Go |
| Incident runbook | 4 kịch bản: DB unavailable, provider outage, mail outage, secret lộ → hành vi typed đã có + bước operator (rotate key, fence disabled, rollback) | file `docs/RUNBOOK_INCIDENT.md` (tạo ở P126) |
| Retention dữ liệu | learner data: theo consent/pilot policy; log: ≤30 ngày; artifact CI: retention bounded | cấu hình + ghi trong runbook |

- CẤM thêm dependency giám sát/APM mới trong P126 (dùng Vercel/Turso sẵn có); nếu cần → plan riêng.

## Handover và tài liệu

- BẮT BUỘC cập nhật: `README.md` (trạng thái hosted thật, cách chạy, cách deploy, link runbook), `docs/learning.md`, `docs/AI_FIRST_ARCHITECTURE.md` (p11-v1), `.env.example` (tên biến, không giá trị), `brain4agent/*` 7 phân vùng (kernel, index, intro, data, gotchas, roadmap, changelog, hot).
- BẮT BUỘC changelog `1.0.0 — <ngày>` liệt kê: những gì được chứng minh, những gì **không** claim (pronunciation, efficacy nhân quả, SLA).
- BẮT BUỘC `state.json.current_version = "1.0.0"`, `package.json.version = "1.0.0"`, tag `v1.0.0` trên SHA release.
- Roadmap sau 1.0.0: liệt kê Non-goals của 00-ARCHITECTURE thành idea vault, không cam kết.

## Vùng cấm

- CẤM release khi D5 report kết luận "không nên phát hành" mà không có quyết định user ghi rõ chấp nhận rủi ro.
- CẤM tuyên bố CEFR, hiệu quả học tập nhân quả, hay phát âm trong materials phát hành.
- CẤM tắt fence/DNS flip trong cùng lệnh với deploy (tách bước, tách phê duyệt).
- CẤM xoá Worker/D1 rollback asset trước khi user quyết định riêng sau ≥1 chu kỳ vận hành ổn định.

## Ma trận lỗi / operator

| Lỗi | Hành vi |
|---|---|
| Verifier Production import FAIL | dừng; không deploy; điều tra snapshot |
| Fingerprint disabled lệch | fence giữ; không enable |
| First write lỗi sau enable | fence disabled ngay; reconcile; ghi incident |
| Mail prod không đến | không mở public traffic; Plan09 gate ⬜ |
| Provider live smoke FAIL | vẫn có thể Go nếu user chấp nhận typed-unavailable ở launch — ghi rõ; D3 vẫn theo P124 |
| Restore drill FAIL | No-Go |

## Nghiệm thu P126

- Receipt cho từng bước 1–4 với deployment id, SHA, fingerprint, mốc phê duyệt.
- Restore drill: thời gian, verifier output.
- Bảng quota/alert/cost cap tại ngày Go.
- `docs/RUNBOOK_INCIDENT.md` tồn tại, ≤2 trang, 4 kịch bản.
- Version 1.0.0 ở 3 nơi + tag; Plan07 gates "server disabled/enabled/rollback" ✅ + ngày; Plan09 "server" ✅; Plan12 Exit Gates toàn ✅ hoặc ghi UNVERIFIED có lý do.
