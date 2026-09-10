# Changelog

## 0.3.0 — 2026-09-10 (working tree, chưa commit/deploy)
- Daily Quest start path truyền history scenario owned đã validate cho planner, tránh lặp authored scenario khi còn lựa chọn khác.
- Session không evidence không thể complete/cộng phút; manual end có evidence nhưng chưa qua success state là `PARTIAL`, debrief chỉ dẫn luyện tiếp thay vì trophy. Auto BOSS success vẫn là `COMPLETED`.
- Dashboard/progress dùng `SkillMastery` adaptive cho meter nghe/từ vựng/chính tả, profile chỉ fallback với skill chưa có record.
- Local gates PASS: 152 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 16/16 DB tạm.
- Không thêm schema migration; không claim deploy/production DB, AI efficacy, live voice latency/speed, rate/quota hay production security closure.

## 0.2.1 — 2026-09-08 (working tree, chưa commit/deploy)
- Memory, evidence và mastery commit trong cùng transaction; retry idempotent; corrupt memory được validate và rollback có test.
- Next action sau manual/auto completion giữ qua reload và dẫn COACH/MISSION/QUEST/PRACTICE owned; mastery dưới 0.6 chủ động chọn luyện lại.
- Timeline shared cho dashboard/progress, tổng 7 ngày không bị giới hạn 50 mục; curriculum không phụ thuộc tên course và loại DRAFT.
- TTS API/sidecar yêu cầu auth và shared key, cache private ngoài public; boundary tests không warm-up/download model.
- Local gates PASS: 139 unit, type-check, lint 0 error/37 warnings, eval mock 15/15, Prisma validate, build, Python sidecar 3/3, E2E 15/15 DB tạm.
- Không claim production readiness, hiệu quả sư phạm thật, voice speed/latency/quota hay deploy.

## 0.1.1 — 2026-09-07 (working tree, chưa commit/deploy)
- Chốt AI-native theo người dùng; dashboard resume/khởi tạo phiên AI là hành động chính.
- Sửa secure-cookie proxy/role redirects, teacher/course owner và draft attempt gate.
- Validator quyết định feedback/state/evidence; CHOICE index phải hợp lệ.
- Completion auto/manual tăng thời gian một lần trong transaction.
- SRS counters tích lũy; queue đến hạn, hết lượt, retry lỗi; intervention reset và bỏ dead voice toggle.
- Unit/browser regression, database E2E riêng, docs/plan/brain engine1.7.2/template1.4.0.
- Bằng chứng cuối ở TESTING-ACCEPTANCE; không suy production readiness.

## 0.2.0 — 2026-09-07 (working tree, chưa commit/deploy)
- Thêm LearnerMemory + migration, learner timeline, nextAction sau completion và pedagogical eval mock.
- Sửa demo dashboard/games/lessons lọc theo course seed cũ khiến trang hiển thị trống.
- Gates local PASS: type-check, 106 unit tests, lint 0 error, Prisma 3 migrations, build, E2E 7/7, eval 15/15 orchestration mock.
- Lưu ý: eval giờ gọi thật orchestrator; grounded 4/15 đúng kỳ vọng, chưa chứng minh hiệu quả học tập thật; production DB/deploy chưa làm.

- 2026-09-07 20:55: Nâng eval từ self-assert sang harness thật qua orchestrator; mock quyết định theo target vocabulary + độ dài, retrieval chỉ theo learner message và chặn off-topic/vague.
