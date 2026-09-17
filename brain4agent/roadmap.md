# ListenAI roadmap

## 2026-09-18 — Plan16 rollout Voice AI (PLANNED, worker thực thi)

Bước kế tiếp là [Plan16](../planning/16_2026-09-18_voice-rollout/plan.md): commit Plan15 + CI → xác minh giọng thật bằng `voice:doctor` với key ElevenLabs → env Vercel + deploy + smoke → theo dõi chi phí → bump 0.8.0 → đồng bộ não. Cần user: key, duyệt commit, Vercel, duyệt bump.

## 2026-09-18 — Plan15 Voice ở mọi màn hình + ElevenLabs (LOCAL ACCEPTED, chưa commit)

Giọng AI ElevenLabs server-side (không key = giọng trình duyệt), chính sách xếp hạng giọng của tài khoản (giọng Default hết hạn 31/12/2026 nên không hard-code ID), route audio cho đáp án ẩn, voice ở game/bài riêng/session mở đầu/bài học/flashcards. Việc tiếp theo: user tạo key → `npm run voice:doctor -- --probe` → env Vercel → deploy → smoke; commit/CI; bump version. Sau pilot: cân nhắc ngân sách TTS theo user.

## 2026-09-18 — Plan14 Voice AI (LOCAL ACCEPTED, chưa commit)

Voice AI được thêm theo yêu cầu user: văn bản nói chuẩn hoá (`prepareSpokenText`), chính sách giọng chọn lọc (neural trước, novelty loại, accent học viên), `voiceScript` do server dựng cho từng lượt AI (không bao giờ đọc câu sai của học viên), nói để trả lời bằng recogniser trình duyệt, `POST /api/voice/pronunciation` chấm mức từ và ghi `VOICE_PRACTICE` vào sổ phiên. Không env mới, không sidecar, chạy nguyên trên Vercel. Việc tiếp theo: user commit/push → CI → deploy → smoke thủ công theo trình duyệt (Plan14 OPERATIONS §3) → quyết định bump 0.8.0. Sau pilot mới cân nhắc dùng điểm phát âm làm bằng chứng kỹ năng.

## Trạng thái ngay lúc này (2026-09-17, sau khi giải quyết findings Root Review)

Ứng viên P120–P126 đã được commit tại `9325ca2`. Toàn bộ 7 findings từ [Root code review](../docs/ROOT_CODE_REVIEW_2026-09-17_P120-P126.md) đã được giải quyết:
- F1/F2: `shouldSerializeLocally()` dùng `resolveDatabaseConfig()`, Turso hosted bypass mutex, 4 test hồi quy.
- F3: `clearOwnerIntents` nối vào đăng xuất và đổi tài khoản trong `app-shell.tsx`, 6/6 unit tests PASS.
- F4: Bỏ fallback `"anonymous"` ở 4 file UI, yêu cầu xác thực đầy đủ.
- F5/F6/F7: Câu chữ changelog & ledger chuẩn hóa.
- Version: Đã nâng lên `0.6.0` sau khi D1 đạt cả local và CI remote GitHub Actions (Run ID 35187260657, 15/15 bước PASS).
- Toàn bộ cổng kiểm thử cục bộ: 494 tests vitest qua 93 files (100%), 24/24 Playwright E2E, type-check 0 lỗi, lint 0 lỗi/32 cảnh báo, build 42 routes PASS, eval 12/12 PASS, dev.db nguyên vẹn.

D1 hoàn tất (local + CI); D4 đạt ở local; các cổng D2 (Preview 0.7.0 / Prod 1.0.0), D3 (Live AI 0.8.0), D5 (Pilot 0.9.0) chờ đầu vào của user (phê duyệt cửa sổ Preview/cutover, provider kèm hạn mức chi, đồng thuận pilot).

## Uu tien moi phat sinh 2026-09-17 — lo AI

Tinh nang AI da chet hoan toan do `KIRAAI_MODEL` tro toi model khong ton tai; da sua va chung minh bang hoi thoai that ([bao cao](../docs/AI_PROVIDER_OUTAGE_2026-09-17.md)). Ba viec nen lam truoc khi tinh den pilot:

1. Phan biet sai cau hinh voi qua tai trong tang provider; validate model luc doc cau hinh; log than loi cua provider. Khong de mot loi vinh vien nup duoi thong bao "thu lai sau".
2. Chot model tra phi va han muc chi; free tier rate-limit gat nen khong dung cho nguoi hoc that.
3. Them mot smoke that cham provider vao quy trinh; toan bo test hien dung provider tat dinh nen khong bao gio bat duoc loai loi nay.

## Current master plan
[Plan12](../planning/12_2026-09-17_project-completion-release/plan.md), PLANNED 2026-09-17: hoàn thiện dự án tới 1.0.0 theo Definition of Done D1–D6 (integrity, hosted+rollback+mail, live AI có reviewer, causal next action, pilot đã đánh giá, handover). Contract kỹ thuật vẫn ở [Plan11](../planning/11_2026-09-16_ai-native-evidence-gates/plan.md); hosted/mail vẫn Plan07/09.

1. P120 qualify WIP P110–P112 đang có (chưa commit): sửa 7 lỗi TS, 8 lỗi lint, thay 2 test design (T111-02a/b, 03a/b), đo và quyết định mutex tiến trình, intent owner-scoped + pending-block, migration chỉ trên fixture; commit ứng viên khi user cho phép → 0.6.0 cùng CI.
2. P121 đóng phần còn lại Plan11 P111/P112: T111-05/06, T112-01/02/03 với fault-injection ở `tx.execute`, E2E trang thật, dispatch counter; requalify Plan10 P102/P103/P106.
3. P122 CI run thật (cần `gh` login) → Preview disabled all-table fingerprint → Preview enabled window có manifest/phê duyệt (retry 20/1, owner isolation, WAF, mail ×3, fence restored) → 0.7.0.
4. P123 causal `p11-v1` trong planner hiện có; P124 `eval:learning` offline ≥12 case + live reviewer suite có cap (cần provider/budget/reviewer) và ≥1 coaching live hosted → 0.8.0.
5. P125 pilot 5–8 người có consent, baseline → transfer → delayed 7 ngày, report trung thực → 0.9.0.
6. P126 Go/No-Go → Plan07 server disabled (export/import/verifier) → rollback drill → enabled + mail prod + smoke → ops hậu phát hành (restore drill, alert, cost cap, `docs/RUNBOOK_INCIDENT.md`) → docs/brain/version 1.0.0.

Ước lượng ~16 ngày công + ~3 tuần lịch chờ phê duyệt/pilot. Blocking inputs: provider/budget; segment/reviewer/consent; gh; phê duyệt cửa sổ hosted; phê duyệt cutover.

## Infrastructure authority and release
Plan07 giữ canonical staging/disposable clone, final D1 export, Production, cutover, rollback reconciliation-aware. Plan09 giữ mail thật. Version bump chỉ theo bậc thang Plan12 01-CONTRACTS, đủ 3 nơi (package.json, state.json, changelog). Package hiện 0.5.0.

## Existing foundation / historical evidence
Plan08 local 387 unit/20 E2E (reliability/intent/planner). Plan09 local 425/20. Plan10 historical 437/20/7 Python, P102/P103/P106 qualified 09-16. Plan11 spec + WIP chưa nghiệm thu. Plan03/04 local loop/evidence; Plan05/06 Cloudflare lịch sử. Không rebuild memory/calibration/orchestrator; không suy live provider từ key binding.

## Idea vault / outside 1.0.0
Speech/STT/pronunciation, streaming, curriculum lớn, vector retrieval, global JWT revocation, lint cleanup rộng, visual/a11y audit, multi-tenant/thanh toán, APM mới. Mỗi mục cần plan riêng sau 1.0.0; không mục nào thay thế việc quan sát chất lượng coaching và transfer.
