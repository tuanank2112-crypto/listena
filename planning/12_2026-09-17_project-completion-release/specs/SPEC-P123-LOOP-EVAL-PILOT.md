# SPEC-P123/P124/P125 — Vòng học AI-native, đánh giá và pilot (ràng buộc Plan12)

Contract chi tiết: [Plan11 SPEC-P114](../../11_2026-09-16_ai-native-evidence-gates/specs/SPEC-P114-LEARNING-LOOP.md) và [Plan11 SPEC-P115](../../11_2026-09-16_ai-native-evidence-gates/specs/SPEC-P115-EVALUATION-PILOT.md). Plan12 **không** viết lại. File này cố định: điều kiện bắt đầu, đầu vào user, thứ tự, và tiêu chí "đủ để lên bậc" 0.8.0/0.9.0.

## P123 = Plan11 P114 (causal next action)

Điều kiện bắt đầu: P120 đóng (contract receipt/write-tx ổn định). Không cần P121/P122.

Ràng buộc Plan12 thêm:

- BẮT BUỘC giữ `p08-v1` parse được; thêm `p11-v1` + `CausalBasis` **additive** ở `src/server/learning/decision.ts`, `planner.ts`; mọi consumer (dashboard, debrief, game hub, `reducer.ts`) test cả hai version.
- BẮT BUỘC E2E `next-action.spec.ts` (8 case hiện có) giữ xanh; thêm ≥2 case: (a) listening weak + chỉ vocabulary refs → không claim listening; (b) recurring error → practice → comeback → next action giữ qua reload.
- CẤM đổi ngưỡng calibration để fixture qua.
- Số đo: matched refs / cited refs = 100%; foreign refs = 0; planner GET writes = 0 và provider calls = 0 theo all-table fingerprint (tái dùng script P122).

## P124 = Plan11 P115 (eval runtime + reviewer)

Điều kiện bắt đầu: dataset/rubric chuẩn bị ngay sau P120; chạy offline sau P123; live chỉ khi có input user.

Đầu vào user (chặn live): provider (Kira `glm-5.3-flash-free` hiện cấu hình hay OpenAI), `--max-calls`, `--max-cost-usd`, ≥2 reviewer (danh tính, không phải model sinh), môi trường (local có key hay Preview).

Ràng buộc Plan12 thêm:

- BẮT BUỘC thêm script `eval:learning` vào `package.json` đúng chữ ký Plan11; output vào `eval/runs/<date>-<sha>/` (đã ignore) + summary không nhạy cảm vào ledger.
- BẮT BUỘC không ghi đè `eval/report.md` (file người dùng đang dirty).
- BẮT BUỘC giá provider: root xác nhận pricing/docs hiện hành **trước** live; không có giá → chỉ smoke cố định số call, `costUnknown=true`.
- Live thành công **≥1 lượt coaching thật** trên môi trường hosted được phép là điều kiện của D3; typed-unavailable không đóng D3.
- Ngưỡng pilot-readiness (Plan11 §Dataset and rubric) phải được user xác nhận hoặc sửa **trước** khi chấm; ghi mốc ở plan.md.

## P125 = Plan11 P116 (pilot có consent)

Điều kiện bắt đầu: P122 Preview enabled ✅ (account/mail/ownership chứng minh trên hosted), P124 reviewer gate PASS hoặc user waive có ghi, và **đủ 4 input**: segment, recruitment, consent + retention, reviewer.

Ràng buộc Plan12 thêm:

- Pilot chạy trên **Preview enabled window kéo dài** (clone disposable riêng cho pilot, không phải clone test) hoặc Production sau cutover — quyết định của user; mặc định Preview để không phụ thuộc P126.
- BẮT BUỘC lịch: ngày 0 baseline → ngày 1–7 ≥3 session → ngày 7 transfer → ngày 14 delayed. Report nộp ngày ≤16.
- BẮT BUỘC raw data ngoài git/brain; chỉ pseudonymous aggregate vào ledger.
- Kết quả âm/attrition cao vẫn đóng D5; khuyến nghị release ở P126 phải trích dẫn report này.
- CẤM agent gửi tin tuyển người/nhắn học viên nếu không có uỷ quyền tường minh.

## Vùng cấm chung

- CẤM planner/memory thứ hai, vector DB, framework agent.
- CẤM coi structural 30/30 hoặc deterministic 15/15 là chất lượng dạy.
- CẤM chấm bằng chính model sinh; CẤM impute điểm reviewer thiếu.

## Ma trận lỗi / caller

Kế thừa Plan11 SPEC-P114 và SPEC-P115 nguyên văn. Bổ sung:

| Lỗi | Hành vi |
|---|---|
| User chưa cấp provider/budget | P124 dừng ở offline; D3 UNVERIFIED; không chặn P123/P121/P122 |
| Reviewer < 2 | T115-02 UNVERIFIED |
| Preview enabled chưa ✅ khi muốn pilot | không tuyển; P125 chờ |

## Nghiệm thu bậc

- 0.8.0 yêu cầu: T114-01/02 ✅ local + CI; T115-01 ≥12 case offline ✅; T115-02 live/reviewer PASS (hoặc waive ghi) ; ≥1 live coaching thành công hosted.
- 0.9.0 yêu cầu: T116-01 report với counts enrolled/completed/withdrawn, paired baseline/transfer/delayed, limitations.
